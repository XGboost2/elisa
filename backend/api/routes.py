"""
API routes for ELISA plate analysis
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional
import os
import re
import uuid
import json
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


def _validate_id(value: str, label: str = "ID") -> None:
    if not VALID_UUID_RE.match(value):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")


def _is_valid_image(data: bytes) -> bool:
    return any(data[:len(m)] == m for m in IMAGE_MAGIC)


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


class AnalysisResponse(BaseModel):
    analysis_id: str
    timestamp: str
    success: bool
    error: Optional[str] = None
    quality: Optional[dict] = None
    wells_detected: Optional[int] = None
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
    file: UploadFile = File(..., description="ELISA plate image")
):
    print(f"📤 Received upload: {file.filename} ({file.content_type})")

    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(
            status_code=400,
            detail=f"File must be an image. Received: {file.content_type}"
        )

    contents = await file.read()
    if len(contents) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max size is {settings.MAX_UPLOAD_SIZE // (1024 * 1024)}MB"
        )
    if not _is_valid_image(contents):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid image")

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
        results = plate_analyzer.analyze_image(upload_path)
    except Exception as e:
        return AnalysisResponse(
            analysis_id=analysis_id,
            timestamp=timestamp,
            success=False,
            error=str(e)
        )

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
        wells=results.get("wells")
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
