"""
Core ELISA plate analysis engine
Handles plate detection, uniform grid mapping, chromogen-aware color analysis,
control normalization, edge-effect detection, and qualitative cutoff.

NOTE: Camera-based analysis is semi-quantitative. For research / point-of-care
screening only — not a replacement for spectrophotometric plate readers.
"""
import cv2
import numpy as np
from typing import Tuple, List, Optional, Dict
from dataclasses import dataclass, field

from utils.config import settings
from utils.image_preprocessing import (
    normalize_lighting,
    reduce_noise,
    correct_perspective,
    assess_image_quality
)

# BGR channel indices for chromogen-specific measurement.
# Using the substrate's absorption channel gives better dynamic range
# than grayscale (research shows ~2× improvement for TMB blue channel).
CHROMOGENS = {
    "tmb":       {"channel": 0, "ref_channel": 2, "label": "TMB (450 nm)"},
    "opd":       {"channel": 1, "ref_channel": 2, "label": "OPD (492 nm)"},
    "pnpp":      {"channel": 0, "ref_channel": 2, "label": "pNPP (405 nm)"},
    "abts":      {"channel": 1, "ref_channel": 2, "label": "ABTS (405 nm)"},
    "grayscale": {"channel": None, "ref_channel": None, "label": "Grayscale"},
}

DEFAULT_CHROMOGEN = "tmb"


@dataclass
class WellData:
    """Data for a single well"""
    row: int
    col: int
    position: str
    center: Tuple[int, int]
    rgb_mean: Tuple[float, float, float]
    rgb_median: Tuple[float, float, float]
    intensity: float
    optical_density: float
    normalized_signal: Optional[float] = None
    is_edge: bool = False


class PlateAnalyzer:
    """ELISA plate detection and analysis"""

    CORRECTED_WIDTH = 1200
    CORRECTED_HEIGHT = 900

    def __init__(self):
        self.rows = settings.PLATE_ROWS
        self.cols = settings.PLATE_COLS
        self.total_wells = settings.TOTAL_WELLS

    # ------------------------------------------------------------------
    # Plate detection
    # ------------------------------------------------------------------

    def detect_plate(self, image: np.ndarray) -> Optional[np.ndarray]:
        """Detect plate boundaries using edge detection."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = reduce_noise(gray)
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return None

        max_area = 0
        best_contour = None
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > max_area:
                epsilon = 0.02 * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)
                if len(approx) == 4 and area > 10000:
                    max_area = area
                    best_contour = approx

        if best_contour is None:
            return None
        return self._order_corners(best_contour.reshape(4, 2))

    def _detect_plate_robust(self, image: np.ndarray) -> Optional[np.ndarray]:
        """Robust multi-strategy plate detection for real-time camera frames."""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = reduce_noise(gray)
        h, w = gray.shape[:2]
        min_area = h * w * 0.10

        best_contour = None
        best_area = 0

        for low, high in [(30, 100), (50, 150), (80, 200)]:
            edges = cv2.Canny(gray, low, high, apertureSize=3)
            kernel = np.ones((3, 3), np.uint8)
            edges = cv2.dilate(edges, kernel, iterations=1)
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for contour in contours:
                area = cv2.contourArea(contour)
                if area < min_area or area <= best_area:
                    continue
                for eps_factor in [0.01, 0.02, 0.03, 0.05]:
                    epsilon = eps_factor * cv2.arcLength(contour, True)
                    approx = cv2.approxPolyDP(contour, epsilon, True)
                    if 4 <= len(approx) <= 6:
                        best_area = area
                        best_contour = contour
                        break

        if best_contour is None:
            binary = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY_INV, 11, 2,
            )
            kernel = np.ones((5, 5), np.uint8)
            binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for contour in contours:
                area = cv2.contourArea(contour)
                if area < min_area or area <= best_area:
                    continue
                best_area = area
                best_contour = contour

        if best_contour is None:
            return None

        rect = cv2.minAreaRect(best_contour)
        box = cv2.boxPoints(rect)
        return self._order_corners(box)

    def _order_corners(self, points: np.ndarray) -> np.ndarray:
        """Order corner points: [TL, TR, BR, BL]"""
        sorted_y = points[np.argsort(points[:, 1])]
        top = sorted_y[:2][np.argsort(sorted_y[:2, 0])]
        bottom = sorted_y[2:][np.argsort(sorted_y[2:, 0])]
        return np.array([top[0], top[1], bottom[1], bottom[0]], dtype=np.float32)

    def _create_uniform_grid(self, width: int, height: int) -> Tuple[List[int], List[int]]:
        """Create uniform well grid for a perspective-corrected plate image."""
        mx = width * 0.05
        my = height * 0.05
        rs = (height - 2 * my) / (self.rows - 1)
        cs = (width - 2 * mx) / (self.cols - 1)
        rows = [int(my + i * rs) for i in range(self.rows)]
        cols = [int(mx + i * cs) for i in range(self.cols)]
        return rows, cols

    # ------------------------------------------------------------------
    # Well extraction — chromogen-aware
    # ------------------------------------------------------------------

    def analyze_wells(
        self,
        image: np.ndarray,
        row_positions: List[int],
        col_positions: List[int],
        well_radius: int = 20,
        chromogen: str = DEFAULT_CHROMOGEN,
    ) -> List[WellData]:
        """
        Extract color data from each well on a RAW (non-CLAHE) image.

        When a chromogen is specified, the measurement uses the substrate's
        primary absorption channel (e.g. blue for TMB) instead of grayscale.
        This improves dynamic range by ~2× on 8-bit camera sensors.
        """
        config = CHROMOGENS.get(chromogen, CHROMOGENS[DEFAULT_CHROMOGEN])
        meas_ch = config["channel"]
        ref_ch = config["ref_channel"]

        wells_data: List[WellData] = []
        row_labels = "ABCDEFGH"

        for i, y in enumerate(row_positions):
            for j, x in enumerate(col_positions):
                mask = np.zeros(image.shape[:2], dtype=np.uint8)
                cv2.circle(mask, (x, y), well_radius, 255, -1)
                well_pixels = image[mask == 255]

                if len(well_pixels) == 0:
                    continue

                rgb_mean = tuple(np.mean(well_pixels, axis=0).astype(float))
                rgb_median = tuple(np.median(well_pixels, axis=0).astype(float))

                # Channel-specific intensity
                if meas_ch is not None:
                    raw = float(np.mean(well_pixels[:, meas_ch]))
                    if ref_ch is not None:
                        ref = float(np.mean(well_pixels[:, ref_ch]))
                        intensity = max(raw - 0.3 * ref, 1.0)
                    else:
                        intensity = raw
                else:
                    gray = cv2.cvtColor(well_pixels.reshape(-1, 1, 3), cv2.COLOR_BGR2GRAY)
                    intensity = float(np.mean(gray))

                od = -np.log10((intensity + 1) / 256.0)
                is_edge = (i == 0 or i == self.rows - 1 or j == 0 or j == self.cols - 1)

                wells_data.append(WellData(
                    row=i, col=j,
                    position=f"{row_labels[i]}{j+1}",
                    center=(x, y),
                    rgb_mean=rgb_mean,
                    rgb_median=rgb_median,
                    intensity=intensity,
                    optical_density=float(od),
                    is_edge=is_edge,
                ))

        return wells_data

    # ------------------------------------------------------------------
    # Control normalization + cutoff + edge-effect detection
    # ------------------------------------------------------------------

    def _apply_control_normalization(
        self,
        wells: List[WellData],
        negative_control: List[str],
        positive_control: List[str],
        assay_type: str = "sandwich",
    ) -> Dict:
        """
        Normalize using positive/negative controls.

        For sandwich ELISA: higher OD = more analyte.
        For competitive ELISA: lower OD = more analyte (%B/B0 reported).
        """
        neg_wells = [w for w in wells if w.position in negative_control]
        pos_wells = [w for w in wells if w.position in positive_control]

        if not neg_wells or not pos_wells:
            return {"applied": False, "reason": "Controls not found on plate"}

        neg_mean_int = float(np.mean([w.intensity for w in neg_wells]))
        pos_mean_int = float(np.mean([w.intensity for w in pos_wells]))

        if neg_mean_int <= 1:
            return {"applied": False, "reason": "Negative control intensity too low"}

        # Blank-corrected OD using negative control as I₀
        for well in wells:
            ratio = max(well.intensity, 1) / neg_mean_int
            well.optical_density = float(max(0.0, -np.log10(min(ratio, 1.0))))

        od_neg = float(np.mean([w.optical_density for w in neg_wells]))
        od_pos = float(np.mean([w.optical_density for w in pos_wells]))
        od_range = od_pos - od_neg

        # Normalized signal / %B/B0
        if abs(od_range) > 0.01:
            for well in wells:
                pct = (well.optical_density - od_neg) / od_range * 100.0
                if assay_type == "competitive":
                    well.normalized_signal = float(100.0 - pct)
                else:
                    well.normalized_signal = float(pct)
        else:
            for well in wells:
                well.normalized_signal = None

        # Qualitative cutoff: mean(neg) + 2 SD / 3 SD
        neg_ods = [w.optical_density for w in neg_wells]
        neg_std = float(np.std(neg_ods)) if len(neg_ods) > 1 else 0.0
        cutoff_2sd = float(np.mean(neg_ods) + 2 * neg_std)
        cutoff_3sd = float(np.mean(neg_ods) + 3 * neg_std)

        signal_to_noise = od_pos / od_neg if od_neg > 0.001 else float("inf")

        return {
            "applied": True,
            "assay_type": assay_type,
            "negative_control": {
                "positions": negative_control,
                "mean_intensity": neg_mean_int,
                "mean_od": od_neg,
            },
            "positive_control": {
                "positions": positive_control,
                "mean_intensity": pos_mean_int,
                "mean_od": od_pos,
            },
            "od_range": od_range,
            "signal_to_noise": float(min(signal_to_noise, 9999)),
            "cutoff_2sd": cutoff_2sd,
            "cutoff_3sd": cutoff_3sd,
            "qc_passed": od_range > 0.05 and signal_to_noise > 2.0,
            "issues": [
                i for i in [
                    "Low OD range between controls" if od_range <= 0.05 else None,
                    "Poor signal-to-noise ratio" if signal_to_noise <= 2.0 else None,
                ] if i is not None
            ],
        }

    def _detect_edge_effects(self, wells: List[WellData]) -> Optional[Dict]:
        """Compare edge-well OD to inner-well OD; flag if >15 % different."""
        edge_ods = [w.optical_density for w in wells if w.is_edge]
        inner_ods = [w.optical_density for w in wells if not w.is_edge]

        if not edge_ods or not inner_ods:
            return None

        edge_mean = float(np.mean(edge_ods))
        inner_mean = float(np.mean(inner_ods))

        if inner_mean < 0.001:
            return {"detected": False, "edge_mean_od": edge_mean, "inner_mean_od": inner_mean, "difference_pct": 0.0}

        diff_pct = float(abs(edge_mean - inner_mean) / inner_mean * 100)
        return {
            "detected": diff_pct > 15,
            "edge_mean_od": edge_mean,
            "inner_mean_od": inner_mean,
            "difference_pct": diff_pct,
        }

    # ------------------------------------------------------------------
    # Replicate statistics
    # ------------------------------------------------------------------

    @staticmethod
    def compute_replicate_stats(wells: List[Dict], replicate_groups: Dict[str, List[str]]) -> List[Dict]:
        """
        Compute mean, SD, CV% for user-defined replicate groups.

        replicate_groups: {"Sample1": ["B1","B2"], "Sample2": ["C1","C2"], ...}
        """
        well_map = {w["position"]: w for w in wells}
        stats = []
        for label, positions in replicate_groups.items():
            ods = [well_map[p]["optical_density"] for p in positions if p in well_map]
            if not ods:
                continue
            mean_od = float(np.mean(ods))
            std_od = float(np.std(ods, ddof=1)) if len(ods) > 1 else 0.0
            cv_pct = float(std_od / mean_od * 100) if mean_od > 0.001 else 0.0
            norms = [well_map[p].get("normalized_signal") for p in positions if p in well_map]
            norms = [n for n in norms if n is not None]
            stats.append({
                "label": label,
                "positions": positions,
                "n": len(ods),
                "mean_od": mean_od,
                "std_od": std_od,
                "cv_pct": cv_pct,
                "cv_acceptable": cv_pct < 10.0,
                "mean_normalized": float(np.mean(norms)) if norms else None,
            })
        return stats

    # ------------------------------------------------------------------
    # Alignment check (camera real-time)
    # ------------------------------------------------------------------

    def check_alignment(self, image_path: str) -> Dict:
        """Quick alignment check for real-time camera feedback."""
        image = cv2.imread(image_path)
        if image is None:
            return {"aligned": False, "reason": "Could not load image"}

        h, w = image.shape[:2]
        scale = 480 / max(h, w)
        small = cv2.resize(image, (int(w * scale), int(h * scale)))
        sh, sw = small.shape[:2]

        small = normalize_lighting(small)
        corners = self._detect_plate_robust(small)
        if corners is None:
            return {"aligned": False, "reason": "No plate detected"}

        pcx = float(np.mean(corners[:, 0]))
        pcy = float(np.mean(corners[:, 1]))
        cox = abs(pcx - sw / 2.0) / sw
        coy = abs(pcy - sh / 2.0) / sh
        is_centered = bool(cox < 0.15 and coy < 0.15)

        pw = float(np.max(corners[:, 0]) - np.min(corners[:, 0]))
        ph = float(np.max(corners[:, 1]) - np.min(corners[:, 1]))
        wr = pw / sw
        hr = ph / sh
        good_size = bool(wr > 0.50 and hr > 0.30)

        tl, tr, bl = corners[0], corners[1], corners[3]
        ta = float(abs(np.degrees(np.arctan2(tr[1] - tl[1], tr[0] - tl[0]))))
        la = float(abs(np.degrees(np.arctan2(bl[0] - tl[0], bl[1] - tl[1]))))
        is_straight = bool(ta < 7.0 and la < 7.0)

        ar = float(pw / ph) if ph > 0 else 0.0
        good_aspect = bool(1.1 < ar < 2.0)

        aligned = is_centered and good_size and is_straight and good_aspect
        reasons = []
        if not is_centered: reasons.append("Plate not centered")
        if not good_size:   reasons.append("Plate too small or too far")
        if not is_straight: reasons.append("Plate is tilted")
        if not good_aspect: reasons.append("Plate aspect ratio incorrect")

        return {
            "aligned": aligned,
            "reason": "; ".join(reasons) if reasons else "Aligned",
            "details": {
                "centered": is_centered, "good_size": good_size,
                "straight": is_straight, "good_aspect": good_aspect,
                "center_offset": [cox, coy], "size_ratio": [wr, hr],
                "top_angle": ta, "aspect_ratio": ar,
            },
        }

    # ------------------------------------------------------------------
    # Full analysis pipeline
    # ------------------------------------------------------------------

    def analyze_image(
        self,
        image_path: str,
        negative_control: Optional[List[str]] = None,
        positive_control: Optional[List[str]] = None,
        chromogen: str = DEFAULT_CHROMOGEN,
        assay_type: str = "sandwich",
    ) -> Dict:
        """
        Complete analysis pipeline.

        Uses CLAHE only for plate detection; raw image is used for
        color measurement so pixel intensities are not distorted.
        """
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Could not load image: {image_path}")

        quality = assess_image_quality(image)

        detection_image = normalize_lighting(image.copy())
        corners = self.detect_plate(detection_image)
        if corners is None:
            return {
                "success": False,
                "error": "Could not detect ELISA plate in image",
                "quality": quality,
            }

        corrected = correct_perspective(
            image, corners,
            output_size=(self.CORRECTED_WIDTH, self.CORRECTED_HEIGHT),
        )

        row_positions, col_positions = self._create_uniform_grid(
            self.CORRECTED_WIDTH, self.CORRECTED_HEIGHT,
        )
        row_sp = row_positions[1] - row_positions[0] if len(row_positions) > 1 else 40
        col_sp = col_positions[1] - col_positions[0] if len(col_positions) > 1 else 40
        well_radius = int(min(row_sp, col_sp) * 0.35)

        wells_data = self.analyze_wells(
            corrected, row_positions, col_positions, well_radius, chromogen,
        )

        # Control normalization
        control_qc = None
        if negative_control and positive_control and wells_data:
            control_qc = self._apply_control_normalization(
                wells_data, negative_control, positive_control, assay_type,
            )

        # Edge-effect detection
        edge_effects = self._detect_edge_effects(wells_data)

        wells_out = [
            {
                "position": w.position,
                "row": w.row,
                "col": w.col,
                "rgb_mean": list(w.rgb_mean),
                "rgb_median": list(w.rgb_median),
                "intensity": w.intensity,
                "optical_density": w.optical_density,
                "normalized_signal": w.normalized_signal,
                "is_edge": w.is_edge,
            }
            for w in wells_data
        ]

        return {
            "success": True,
            "quality": quality,
            "plate_detected": True,
            "wells_detected": len(wells_data),
            "expected_wells": self.total_wells,
            "chromogen": chromogen,
            "assay_type": assay_type,
            "control_qc": control_qc,
            "edge_effects": edge_effects,
            "wells": wells_out,
        }
