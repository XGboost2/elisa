"""
API routes for ELISA plate analysis
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import csv
import io
import os
import re
import uuid
import json
import time
import numpy as np
from datetime import datetime

from services.plate_analyzer import PlateAnalyzer
from services.calibration_service import CalibrationService, CalibrationCurve
from utils.config import settings


VALID_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)

# Magic bytes for supported image formats
IMAGE_MAGIC = [
    b'\xff\xd8\xff',       # JPEG
    b'\x89PNG\r\n\x1a\n',  # PNG
    b'GIF87a',             # GIF87
    b'GIF89a',             # GIF89
    b'BM',                 # BMP
    b'RIFF',               # WebP
]

VALID_CHROMOGENS = {"tmb", "opd", "pnpp", "abts", "grayscale"}
VALID_ASSAY_TYPES = {"sandwich", "competitive"}
VALID_WELL_RE = re.compile(r'^[A-H](?:[1-9]|1[0-2])$')


def _validate_id(value: str, label: str = "ID") -> None:
    if not VALID_UUID_RE.match(value):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")


def _is_valid_image(data: bytes) -> bool:
    return any(data[:len(m)] == m for m in IMAGE_MAGIC)


def _validate_finite_values(values: List[float], label: str) -> None:
    if any(not np.isfinite(v) for v in values):
        raise HTTPException(status_code=400, detail=f"{label} must contain only finite numbers")


def _parse_positions(raw: Optional[str], label: str) -> Optional[List[str]]:
    if not raw:
        return None
    positions = [p.strip().upper() for p in raw.split(",") if p.strip()]
    invalid = [p for p in positions if not VALID_WELL_RE.match(p)]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid {label} well position(s): {', '.join(invalid)}")
    return positions


def _dataset_record_dir(plate_id: str) -> str:
    return os.path.join(settings.DATASET_DIR, plate_id)


def _dataset_metadata_path(plate_id: str) -> str:
    return os.path.join(_dataset_record_dir(plate_id), "metadata.json")


def _read_dataset_record(plate_id: str) -> Dict:
    _validate_id(plate_id, "plate ID")
    path = _dataset_metadata_path(plate_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Dataset plate record not found")
    with open(path, "r") as f:
        return json.load(f)


def _write_dataset_record(record: Dict) -> None:
    plate_id = record["plate_id"]
    os.makedirs(_dataset_record_dir(plate_id), exist_ok=True)
    with open(_dataset_metadata_path(plate_id), "w") as f:
        json.dump(record, f, indent=2)


def _extract_numeric(value: str) -> Optional[float]:
    if value is None:
        return None
    cleaned = str(value).strip()
    if not cleaned:
        return None
    cleaned = cleaned.replace(",", ".")
    try:
        number = float(cleaned)
    except ValueError:
        return None
    return number if np.isfinite(number) else None


def _parse_reader_csv(text: str) -> Dict[str, float]:
    rows = list(csv.reader(io.StringIO(text)))
    values: Dict[str, float] = {}

    # Long format: well, od
    for row in rows:
        if len(row) < 2:
            continue
        well = row[0].strip().upper()
        od = _extract_numeric(row[1])
        if VALID_WELL_RE.match(well) and od is not None:
            values[well] = od

    if values:
        return values

    # Matrix format: optional header row with 1..12, then A-H rows.
    for row in rows:
        if len(row) < 13:
            continue
        row_label = row[0].strip().upper()
        if row_label not in "ABCDEFGH":
            continue
        for col_idx in range(12):
            od = _extract_numeric(row[col_idx + 1])
            if od is not None:
                values[f"{row_label}{col_idx + 1}"] = od

    if values:
        return values

    # Vendor-style fallback: scan all adjacent cells for well/value pairs.
    for row in rows:
        for idx, cell in enumerate(row[:-1]):
            well = cell.strip().upper()
            od = _extract_numeric(row[idx + 1])
            if VALID_WELL_RE.match(well) and od is not None:
                values[well] = od

    if not values:
        raise HTTPException(status_code=400, detail="Could not parse any A1-H12 OD values from CSV")
    return values


def _dataset_summary(record: Dict) -> Dict:
    return {
        "plate_id": record["plate_id"],
        "created_at": record["created_at"],
        "study_name": record.get("study_name"),
        "assay_name": record.get("assay_name"),
        "operator": record.get("operator"),
        "device_model": record.get("device_model"),
        "chromogen": record.get("chromogen"),
        "assay_type": record.get("assay_type"),
        "has_reader_csv": bool(record.get("reader_csv")),
        "reader_wells": len(record.get("reader_values", {})),
    }


class NumpySafeEncoder(json.JSONEncoder):
    """JSON encoder that handles numpy types"""
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


router = APIRouter()

plate_analyzer = PlateAnalyzer()
calibration_service = CalibrationService()

# Simple in-memory rate limiter for heavy endpoints
_analyze_timestamps: dict[str, list[float]] = {}
ANALYZE_RATE_LIMIT = 10  # max requests per minute per IP approximation
ANALYZE_RATE_WINDOW = 60.0


def _check_rate_limit(key: str) -> None:
    now = time.monotonic()
    timestamps = _analyze_timestamps.setdefault(key, [])
    timestamps[:] = [t for t in timestamps if now - t < ANALYZE_RATE_WINDOW]
    if len(timestamps) >= ANALYZE_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")
    timestamps.append(now)


class AnalysisResponse(BaseModel):
    analysis_id: str
    timestamp: str
    success: bool
    error: Optional[str] = None
    quality: Optional[dict] = None
    wells_detected: Optional[int] = None
    expected_wells: Optional[int] = None
    chromogen: Optional[str] = None
    assay_type: Optional[str] = None
    control_qc: Optional[dict] = None
    edge_effects: Optional[dict] = None
    wells: Optional[List[dict]] = None


class CalibrationRequest(BaseModel):
    concentrations: List[float] = Field(..., description="Standard concentrations")
    od_values: List[float] = Field(..., description="Measured OD values")
    curve_type: str = Field(
        default="auto", description="Curve type: auto, linear, polynomial, logarithmic, 4pl"
    )


class CalibrationResponse(BaseModel):
    calibration_id: str
    curve_type: str
    coefficients: List[float]
    r_squared: float
    equation: str
    validation: dict


class QuantifyRequest(BaseModel):
    calibration_id: str
    od_values: List[float]


@router.post("/check-alignment")
async def check_alignment(
    file: UploadFile = File(..., description="Camera frame for alignment check")
):
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")

    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size is {settings.MAX_UPLOAD_SIZE // (1024 * 1024)}MB"
        )
    if not _is_valid_image(contents):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid image")

    temp_id = str(uuid.uuid4())
    file_extension = os.path.splitext(file.filename or "frame.jpg")[1] or ".jpg"
    temp_path = os.path.join(settings.UPLOAD_DIR, f"align_{temp_id}{file_extension}")

    try:
        with open(temp_path, "wb") as buffer:
            buffer.write(contents)
        result = plate_analyzer.check_alignment(temp_path)
        return JSONResponse(content=json.loads(json.dumps(result, cls=NumpySafeEncoder)))
    except Exception as e:
        return {"aligned": False, "reason": str(e)}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_plate(
    request: Request,
    file: UploadFile = File(..., description="ELISA plate image"),
    negative_control: Optional[str] = Form(None, description="Comma-separated negative control positions"),
    positive_control: Optional[str] = Form(None, description="Comma-separated positive control positions"),
    chromogen: str = Form("tmb", description="Substrate: tmb, opd, pnpp, abts, grayscale"),
    assay_type: str = Form("sandwich", description="sandwich or competitive"),
):
    client_host = request.client.host if request.client else "unknown"
    _check_rate_limit(f"analyze:{client_host}")

    chromogen = chromogen.lower().strip()
    assay_type = assay_type.lower().strip()
    if chromogen not in VALID_CHROMOGENS:
        raise HTTPException(status_code=400, detail=f"Unsupported chromogen: {chromogen}")
    if assay_type not in VALID_ASSAY_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported assay type: {assay_type}")

    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail=f"File must be an image. Received: {file.content_type}")

    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Max {settings.MAX_UPLOAD_SIZE // (1024*1024)}MB")
    if not _is_valid_image(contents):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid image")

    neg_list = _parse_positions(negative_control, "negative control")
    pos_list = _parse_positions(positive_control, "positive control")
    if neg_list and pos_list and set(neg_list).intersection(pos_list):
        raise HTTPException(status_code=400, detail="A well cannot be both a negative and positive control")

    analysis_id = str(uuid.uuid4())
    timestamp = datetime.utcnow().isoformat()
    file_extension = os.path.splitext(file.filename or "image.jpg")[1] or ".jpg"
    upload_path = os.path.join(settings.UPLOAD_DIR, f"{analysis_id}{file_extension}")

    try:
        with open(upload_path, "wb") as buffer:
            buffer.write(contents)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    try:
        results = plate_analyzer.analyze_image(
            upload_path,
            negative_control=neg_list,
            positive_control=pos_list,
            chromogen=chromogen,
            assay_type=assay_type,
        )
    except Exception as e:
        return AnalysisResponse(analysis_id=analysis_id, timestamp=timestamp, success=False, error=str(e))

    results = json.loads(json.dumps(results, cls=NumpySafeEncoder))

    results_path = os.path.join(settings.RESULTS_DIR, f"{analysis_id}.json")
    with open(results_path, "w") as f:
        json.dump({"analysis_id": analysis_id, "timestamp": timestamp, **results}, f, indent=2)

    return AnalysisResponse(
        analysis_id=analysis_id,
        timestamp=timestamp,
        success=results.get("success", False),
        error=results.get("error"),
        quality=results.get("quality"),
        wells_detected=results.get("wells_detected"),
        expected_wells=results.get("expected_wells"),
        chromogen=results.get("chromogen"),
        assay_type=results.get("assay_type"),
        control_qc=results.get("control_qc"),
        edge_effects=results.get("edge_effects"),
        wells=results.get("wells"),
    )


@router.get("/results/{analysis_id}")
async def get_results(analysis_id: str):
    _validate_id(analysis_id, "analysis ID")
    results_path = os.path.join(settings.RESULTS_DIR, f"{analysis_id}.json")

    if not os.path.exists(results_path):
        raise HTTPException(status_code=404, detail="Results not found")

    with open(results_path, "r") as f:
        return json.load(f)


@router.post("/calibrate", response_model=CalibrationResponse)
async def create_calibration(request: CalibrationRequest):
    if len(request.concentrations) != len(request.od_values):
        raise HTTPException(
            status_code=400,
            detail="Concentrations and OD values must have same length"
        )
    if len(request.concentrations) < 3:
        raise HTTPException(
            status_code=400,
            detail="At least 3 calibration points required"
        )
    _validate_finite_values(request.concentrations, "Concentrations")
    _validate_finite_values(request.od_values, "OD values")
    if any(c < 0 for c in request.concentrations):
        raise HTTPException(status_code=400, detail="Concentrations must be non-negative")

    try:
        curve = calibration_service.fit_curve(
            request.concentrations,
            request.od_values,
            request.curve_type
        )
        validation = calibration_service.validate_curve(curve)
        calibration_id = str(uuid.uuid4())

        calibration_path = os.path.join(settings.RESULTS_DIR, f"cal_{calibration_id}.json")
        with open(calibration_path, "w") as f:
            json.dump({
                "calibration_id": calibration_id,
                "timestamp": datetime.utcnow().isoformat(),
                "curve_type": curve.curve_type,
                "coefficients": curve.coefficients,
                "r_squared": curve.r_squared,
                "equation": curve.equation,
                "points": [
                    {
                        "concentration": p.concentration,
                        "od_value": p.od_value,
                        "position": p.position
                    }
                    for p in curve.points
                ],
                "validation": validation
            }, f, indent=2)

        return CalibrationResponse(
            calibration_id=calibration_id,
            curve_type=curve.curve_type,
            coefficients=curve.coefficients,
            r_squared=curve.r_squared,
            equation=curve.equation,
            validation=validation
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Calibration failed: {str(e)}")


@router.post("/quantify")
async def quantify_samples(request: QuantifyRequest):
    _validate_id(request.calibration_id, "calibration ID")
    _validate_finite_values(request.od_values, "OD values")
    calibration_path = os.path.join(settings.RESULTS_DIR, f"cal_{request.calibration_id}.json")

    if not os.path.exists(calibration_path):
        raise HTTPException(status_code=404, detail="Calibration not found")

    with open(calibration_path, "r") as f:
        cal_data = json.load(f)

    curve = CalibrationCurve(
        points=[],
        curve_type=cal_data["curve_type"],
        coefficients=cal_data["coefficients"],
        r_squared=cal_data["r_squared"],
        equation=cal_data["equation"]
    )

    concentrations = [
        calibration_service.calculate_concentration(od, curve) for od in request.od_values
    ]

    return {
        "calibration_id": request.calibration_id,
        "curve_type": curve.curve_type,
        "equation": curve.equation,
        "r_squared": curve.r_squared,
        "results": [
            {
                "od_value": od,
                "concentration": conc,
                "status": "calculated" if conc is not None else "out_of_range"
            }
            for od, conc in zip(request.od_values, concentrations)
        ]
    }


@router.get("/calibrations")
async def list_calibrations():
    calibrations = []
    for filename in os.listdir(settings.RESULTS_DIR):
        if filename.startswith("cal_") and filename.endswith(".json"):
            path = os.path.join(settings.RESULTS_DIR, filename)
            with open(path, "r") as f:
                cal_data = json.load(f)
                calibrations.append({
                    "calibration_id": cal_data["calibration_id"],
                    "timestamp": cal_data["timestamp"],
                    "curve_type": cal_data["curve_type"],
                    "r_squared": cal_data["r_squared"],
                    "n_points": len(cal_data["points"])
                })

    calibrations.sort(key=lambda x: x["timestamp"], reverse=True)
    return {"calibrations": calibrations}


@router.delete("/results/{analysis_id}")
async def delete_results(analysis_id: str):
    _validate_id(analysis_id, "analysis ID")
    results_path = os.path.join(settings.RESULTS_DIR, f"{analysis_id}.json")
    upload_path = None

    for ext in ['.jpg', '.jpeg', '.png', '.bmp']:
        path = os.path.join(settings.UPLOAD_DIR, f"{analysis_id}{ext}")
        if os.path.exists(path):
            upload_path = path
            break

    deleted = []

    if os.path.exists(results_path):
        os.remove(results_path)
        deleted.append("results")

    if upload_path and os.path.exists(upload_path):
        os.remove(upload_path)
        deleted.append("image")

    if not deleted:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return {"message": f"Deleted {', '.join(deleted)}", "analysis_id": analysis_id}


# ------------------------------------------------------------------
# Dataset collection for validation / ML training
# ------------------------------------------------------------------

@router.post("/dataset/plates")
async def create_dataset_plate(
    file: UploadFile = File(..., description="Raw plate photo for dataset collection"),
    study_name: str = Form("", description="Study or batch name"),
    assay_name: str = Form("", description="Assay name"),
    operator: str = Form("", description="Operator or lab mate identifier"),
    device_model: str = Form("", description="Phone/camera model"),
    lighting_condition: str = Form("", description="Lighting or fixture description"),
    chromogen: str = Form("tmb", description="Substrate: tmb, opd, pnpp, abts, grayscale"),
    assay_type: str = Form("sandwich", description="sandwich or competitive"),
    notes: str = Form("", description="Free-text notes"),
):
    chromogen = chromogen.lower().strip()
    assay_type = assay_type.lower().strip()
    if chromogen not in VALID_CHROMOGENS:
        raise HTTPException(status_code=400, detail=f"Unsupported chromogen: {chromogen}")
    if assay_type not in VALID_ASSAY_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported assay type: {assay_type}")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large. Max {settings.MAX_UPLOAD_SIZE // (1024 * 1024)}MB")
    if not _is_valid_image(contents):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid image")

    plate_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()
    ext = os.path.splitext(file.filename or "plate.jpg")[1].lower() or ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp"}:
        ext = ".jpg"

    record_dir = _dataset_record_dir(plate_id)
    os.makedirs(record_dir, exist_ok=True)
    image_filename = f"plate{ext}"
    image_path = os.path.join(record_dir, image_filename)
    with open(image_path, "wb") as f:
        f.write(contents)

    record = {
        "plate_id": plate_id,
        "created_at": created_at,
        "updated_at": created_at,
        "image_filename": image_filename,
        "image_path": image_path,
        "study_name": study_name.strip(),
        "assay_name": assay_name.strip(),
        "operator": operator.strip(),
        "device_model": device_model.strip(),
        "lighting_condition": lighting_condition.strip(),
        "chromogen": chromogen,
        "assay_type": assay_type,
        "notes": notes.strip(),
        "reader_csv": None,
        "reader_values": {},
    }
    _write_dataset_record(record)
    return record


@router.get("/dataset/plates")
async def list_dataset_plates():
    os.makedirs(settings.DATASET_DIR, exist_ok=True)
    records = []
    for plate_id in os.listdir(settings.DATASET_DIR):
        path = _dataset_metadata_path(plate_id)
        if os.path.exists(path):
            with open(path, "r") as f:
                records.append(_dataset_summary(json.load(f)))
    records.sort(key=lambda r: r["created_at"], reverse=True)
    return {"plates": records}


@router.get("/dataset/plates/{plate_id}")
async def get_dataset_plate(plate_id: str):
    return _read_dataset_record(plate_id)


@router.post("/dataset/plates/{plate_id}/reader-csv")
async def attach_reader_csv(
    plate_id: str,
    file: Optional[UploadFile] = File(None, description="Plate-reader CSV file"),
    csv_text: Optional[str] = Form(None, description="Plate-reader CSV text"),
):
    record = _read_dataset_record(plate_id)
    if file is None and not csv_text:
        raise HTTPException(status_code=400, detail="Provide either a CSV file or csv_text")

    if file is not None:
        raw = await file.read()
        if len(raw) > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"CSV too large. Max {settings.MAX_UPLOAD_SIZE // (1024 * 1024)}MB")
        text = raw.decode("utf-8-sig")
        original_filename = file.filename or "reader.csv"
    else:
        text = csv_text or ""
        original_filename = "pasted_reader.csv"

    reader_values = _parse_reader_csv(text)
    raw_path = os.path.join(_dataset_record_dir(plate_id), "reader_raw.csv")
    values_path = os.path.join(_dataset_record_dir(plate_id), "reader_values.json")
    with open(raw_path, "w", newline="") as f:
        f.write(text)
    with open(values_path, "w") as f:
        json.dump(reader_values, f, indent=2)

    expected = {f"{row}{col}" for row in "ABCDEFGH" for col in range(1, 13)}
    present = set(reader_values.keys())
    record["reader_csv"] = {
        "filename": original_filename,
        "stored_filename": "reader_raw.csv",
        "attached_at": datetime.utcnow().isoformat(),
    }
    record["reader_values"] = reader_values
    record["reader_missing_wells"] = sorted(expected - present)
    record["reader_extra_wells"] = sorted(present - expected)
    record["updated_at"] = datetime.utcnow().isoformat()
    _write_dataset_record(record)

    return {
        "plate_id": plate_id,
        "parsed_wells": len(reader_values),
        "missing_wells": record["reader_missing_wells"],
        "record": record,
    }


@router.get("/dataset/manifest.csv")
async def export_dataset_manifest():
    """Export one row per labeled well for downstream ML/data-science work."""
    os.makedirs(settings.DATASET_DIR, exist_ok=True)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "plate_id", "well", "reader_od", "image_path", "study_name", "assay_name",
        "operator", "device_model", "lighting_condition", "chromogen", "assay_type",
        "created_at", "notes",
    ])

    for plate_id in sorted(os.listdir(settings.DATASET_DIR)):
        path = _dataset_metadata_path(plate_id)
        if not os.path.exists(path):
            continue
        with open(path, "r") as f:
            record = json.load(f)
        for well, reader_od in sorted(record.get("reader_values", {}).items()):
            writer.writerow([
                record["plate_id"],
                well,
                reader_od,
                record.get("image_path", ""),
                record.get("study_name", ""),
                record.get("assay_name", ""),
                record.get("operator", ""),
                record.get("device_model", ""),
                record.get("lighting_condition", ""),
                record.get("chromogen", ""),
                record.get("assay_type", ""),
                record.get("created_at", ""),
                record.get("notes", ""),
            ])

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="elisa_dataset_manifest.csv"'},
    )


# ------------------------------------------------------------------
# CSV export
# ------------------------------------------------------------------

@router.get("/export/{analysis_id}")
async def export_csv(analysis_id: str):
    """Export analysis results as a CSV file (8×12 OD grid + well details)."""
    _validate_id(analysis_id, "analysis ID")
    results_path = os.path.join(settings.RESULTS_DIR, f"{analysis_id}.json")

    if not os.path.exists(results_path):
        raise HTTPException(status_code=404, detail="Results not found")

    with open(results_path, "r") as f:
        data = json.load(f)

    wells = data.get("wells", [])
    row_labels = "ABCDEFGH"
    buf = io.StringIO()
    writer = csv.writer(buf)

    # Header metadata
    writer.writerow(["ELISA Plate Analysis — FOR RESEARCH USE ONLY"])
    writer.writerow(["Analysis ID", data.get("analysis_id", "")])
    writer.writerow(["Timestamp", data.get("timestamp", "")])
    writer.writerow(["Chromogen", data.get("chromogen", "N/A")])
    writer.writerow(["Assay Type", data.get("assay_type", "N/A")])
    writer.writerow([])

    # 8×12 OD grid
    writer.writerow(["OD Grid"] + [str(c + 1) for c in range(12)])
    well_map = {w["position"]: w for w in wells}
    for r in range(8):
        row = [row_labels[r]]
        for c in range(12):
            pos = f"{row_labels[r]}{c+1}"
            w = well_map.get(pos)
            row.append(f"{w['optical_density']:.4f}" if w else "")
        writer.writerow(row)

    writer.writerow([])

    # Normalized signal grid (if available)
    has_norm = any(w.get("normalized_signal") is not None for w in wells)
    if has_norm:
        writer.writerow(["Normalized Signal (%)"] + [str(c + 1) for c in range(12)])
        for r in range(8):
            row = [row_labels[r]]
            for c in range(12):
                pos = f"{row_labels[r]}{c+1}"
                w = well_map.get(pos)
                ns = w.get("normalized_signal") if w else None
                row.append(f"{ns:.1f}" if ns is not None else "")
            writer.writerow(row)
        writer.writerow([])

    # Detailed well list
    writer.writerow(["Position", "Row", "Col", "Intensity", "OD", "Normalized %", "Edge Well"])
    for w in sorted(wells, key=lambda x: (x["row"], x["col"])):
        ns = w.get("normalized_signal")
        writer.writerow([
            w["position"], w["row"], w["col"],
            f"{w['intensity']:.1f}",
            f"{w['optical_density']:.4f}",
            f"{ns:.1f}" if ns is not None else "",
            "yes" if w.get("is_edge") else "",
        ])

    # Control QC
    qc = data.get("control_qc")
    if qc and qc.get("applied"):
        writer.writerow([])
        writer.writerow(["Control QC"])
        writer.writerow(["Neg control OD", f"{qc['negative_control']['mean_od']:.4f}"])
        writer.writerow(["Pos control OD", f"{qc['positive_control']['mean_od']:.4f}"])
        writer.writerow(["OD range", f"{qc['od_range']:.4f}"])
        writer.writerow(["S/N ratio", f"{qc['signal_to_noise']:.1f}"])
        writer.writerow(["Cutoff 2SD", f"{qc.get('cutoff_2sd', 0):.4f}"])
        writer.writerow(["Cutoff 3SD", f"{qc.get('cutoff_3sd', 0):.4f}"])
        writer.writerow(["QC passed", "Yes" if qc["qc_passed"] else "No"])

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="elisa_{analysis_id}.csv"'},
    )


# ------------------------------------------------------------------
# Serial dilution helper
# ------------------------------------------------------------------

class SerialDilutionRequest(BaseModel):
    start_concentration: float = Field(..., gt=0)
    dilution_factor: float = Field(default=2.0, gt=1)
    n_points: int = Field(default=7, ge=2, le=12)
    include_zero: bool = True


@router.post("/serial-dilution")
async def generate_serial_dilution(request: SerialDilutionRequest):
    series = calibration_service.generate_serial_dilution(
        request.start_concentration,
        request.dilution_factor,
        request.n_points,
        request.include_zero,
    )
    return {"concentrations": series}


# ------------------------------------------------------------------
# Replicate statistics
# ------------------------------------------------------------------

class ReplicateRequest(BaseModel):
    wells: List[dict]
    groups: Dict[str, List[str]]


@router.post("/replicate-stats")
async def compute_replicate_stats(request: ReplicateRequest):
    for label, positions in request.groups.items():
        invalid = [p for p in positions if not VALID_WELL_RE.match(p.upper())]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid replicate well position(s) in {label}: {', '.join(invalid)}")
    stats = PlateAnalyzer.compute_replicate_stats(request.wells, request.groups)
    return {"stats": stats}
