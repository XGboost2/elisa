import os
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.calibration_service import CalibrationService
from services.plate_analyzer import PlateAnalyzer, WellData


def test_blank_image_does_not_return_successful_plate_analysis():
    image = np.full((600, 800, 3), 255, dtype=np.uint8)

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        path = tmp.name
    try:
        cv2.imwrite(path, image)
        result = PlateAnalyzer().analyze_image(path)
    finally:
        os.remove(path)

    assert result["success"] is False
    assert result["plate_detected"] is False
    assert result["wells_detected"] == 0


def test_edge_effects_report_difference_percent_and_means():
    analyzer = PlateAnalyzer()
    wells = []
    row_labels = "ABCDEFGH"
    for row in range(8):
        for col in range(12):
            is_edge = row in (0, 7) or col in (0, 11)
            wells.append(
                WellData(
                    row=row,
                    col=col,
                    position=f"{row_labels[row]}{col + 1}",
                    center=(col, row),
                    rgb_mean=(0.0, 0.0, 0.0),
                    rgb_median=(0.0, 0.0, 0.0),
                    intensity=100.0,
                    optical_density=1.3 if is_edge else 1.0,
                    is_edge=is_edge,
                )
            )

    result = analyzer._detect_edge_effects(wells)

    assert result["detected"] is True
    assert result["edge_mean_od"] > result["inner_mean_od"]
    assert result["difference_pct"] > 15


def test_auto_calibration_ignores_4pl_when_zero_standard_is_present():
    service = CalibrationService()
    curve = service.fit_curve(
        concentrations=[0, 1, 2, 4, 8],
        od_values=[0.05, 0.18, 0.31, 0.55, 0.95],
        curve_type="auto",
    )

    assert curve.curve_type in {"linear", "polynomial"}
