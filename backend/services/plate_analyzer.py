"""
Core ELISA plate analysis engine
Handles plate detection, grid identification, and color analysis
"""
import cv2
import numpy as np
from typing import Tuple, List, Optional, Dict
from dataclasses import dataclass

from utils.config import settings
from utils.image_preprocessing import (
    normalize_lighting,
    reduce_noise,
    enhance_edges,
    correct_perspective,
    assess_image_quality
)


@dataclass
class WellData:
    """Data for a single well"""
    row: int
    col: int
    position: str  # e.g., "A1"
    center: Tuple[int, int]
    rgb_mean: Tuple[float, float, float]
    rgb_median: Tuple[float, float, float]
    intensity: float  # Grayscale intensity
    optical_density: float  # OD equivalent


class PlateAnalyzer:
    """ELISA plate detection and analysis"""
    
    def __init__(self):
        self.rows = settings.PLATE_ROWS
        self.cols = settings.PLATE_COLS
        self.total_wells = settings.TOTAL_WELLS
        
    def detect_plate(self, image: np.ndarray) -> Optional[np.ndarray]:
        """
        Detect plate boundaries in the image
        
        Args:
            image: Input BGR image
            
        Returns:
            Four corner points of the plate, or None if not detected
        """
        # Preprocess
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = reduce_noise(gray)
        
        # Edge detection
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        
        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if not contours:
            return None
        
        # Find the largest rectangular contour
        max_area = 0
        best_contour = None
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > max_area:
                # Approximate contour to polygon
                epsilon = 0.02 * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)
                
                # Check if it's roughly rectangular (4 corners)
                if len(approx) == 4 and area > 10000:  # Min area threshold
                    max_area = area
                    best_contour = approx
        
        if best_contour is None:
            return None
        
        # Order corners: top-left, top-right, bottom-right, bottom-left
        corners = self._order_corners(best_contour.reshape(4, 2))
        
        return corners
    
    def _detect_plate_robust(self, image: np.ndarray) -> Optional[np.ndarray]:
        """
        More robust plate detection that tries multiple strategies.
        Used by check_alignment for real-time camera frames which are
        often lower quality / compressed.

        Args:
            image: Input BGR image

        Returns:
            Four corner points of the plate, or None if not detected
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = reduce_noise(gray)
        h, w = gray.shape[:2]
        min_area = h * w * 0.10  # plate should be at least 10% of frame

        best_contour = None
        best_area = 0

        # Strategy 1: Canny with multiple thresholds
        for low, high in [(30, 100), (50, 150), (80, 200)]:
            edges = cv2.Canny(gray, low, high, apertureSize=3)
            # Dilate to close gaps in edges
            kernel = np.ones((3, 3), np.uint8)
            edges = cv2.dilate(edges, kernel, iterations=1)

            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for contour in contours:
                area = cv2.contourArea(contour)
                if area < min_area or area <= best_area:
                    continue

                # Try multiple epsilon values for polygon approximation
                for eps_factor in [0.01, 0.02, 0.03, 0.05]:
                    epsilon = eps_factor * cv2.arcLength(contour, True)
                    approx = cv2.approxPolyDP(contour, epsilon, True)
                    if 4 <= len(approx) <= 6:
                        best_area = area
                        best_contour = contour
                        break

        # Strategy 2: Adaptive threshold + morphology
        if best_contour is None:
            binary = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY_INV, 11, 2
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

        # Use minAreaRect for robust corner extraction (handles non-perfect contours)
        rect = cv2.minAreaRect(best_contour)
        box = cv2.boxPoints(rect)
        corners = self._order_corners(box)

        return corners

    def _order_corners(self, points: np.ndarray) -> np.ndarray:
        """
        Order corner points in consistent order
        
        Args:
            points: 4 corner points
            
        Returns:
            Ordered points [TL, TR, BR, BL]
        """
        # Sort by y-coordinate
        sorted_y = points[np.argsort(points[:, 1])]
        
        # Top two points
        top = sorted_y[:2]
        top = top[np.argsort(top[:, 0])]  # Sort by x
        
        # Bottom two points
        bottom = sorted_y[2:]
        bottom = bottom[np.argsort(bottom[:, 0])]  # Sort by x
        
        return np.array([top[0], top[1], bottom[1], bottom[0]], dtype=np.float32)
    
    def detect_grid(self, image: np.ndarray) -> Tuple[List[int], List[int]]:
        """
        Detect grid lines to identify wells
        
        Args:
            image: Perspective-corrected plate image
            
        Returns:
            Tuple of (row_positions, col_positions) as pixel coordinates
        """
        height, width = image.shape[:2]
        
        # Convert to grayscale
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply threshold to find wells (they are typically darker)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        # Find contours (wells)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Filter contours by size and shape
        wells = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 100 or area > 5000:  # Filter by reasonable well size
                continue
            
            # Get bounding circle
            (x, y), radius = cv2.minEnclosingCircle(contour)
            circularity = area / (np.pi * radius * radius) if radius > 0 else 0
            
            # Wells should be roughly circular
            if circularity > 0.6:
                wells.append((int(x), int(y)))
        
        if len(wells) < self.total_wells * 0.8:  # Should find most wells
            # Fallback to uniform grid
            return self._create_uniform_grid(width, height)
        
        # Cluster wells into rows and columns
        wells = np.array(wells)
        
        # Find row positions
        y_coords = wells[:, 1]
        row_positions = self._cluster_positions(y_coords, self.rows)
        
        # Find column positions
        x_coords = wells[:, 0]
        col_positions = self._cluster_positions(x_coords, self.cols)
        
        return sorted(row_positions), sorted(col_positions)
    
    def _cluster_positions(self, positions: np.ndarray, n_clusters: int) -> List[int]:
        """
        Cluster positions into n groups
        
        Args:
            positions: Array of positions
            n_clusters: Number of clusters
            
        Returns:
            List of cluster centers
        """
        from sklearn.cluster import KMeans
        
        positions = positions.reshape(-1, 1)
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        kmeans.fit(positions)
        
        return [int(center[0]) for center in kmeans.cluster_centers_]
    
    def _create_uniform_grid(self, width: int, height: int) -> Tuple[List[int], List[int]]:
        """
        Create uniform grid as fallback
        
        Args:
            width: Image width
            height: Image height
            
        Returns:
            Tuple of (row_positions, col_positions)
        """
        # Add margins
        margin_x = width * 0.05
        margin_y = height * 0.05
        
        # Calculate spacing
        row_spacing = (height - 2 * margin_y) / (self.rows - 1)
        col_spacing = (width - 2 * margin_x) / (self.cols - 1)
        
        row_positions = [int(margin_y + i * row_spacing) for i in range(self.rows)]
        col_positions = [int(margin_x + i * col_spacing) for i in range(self.cols)]
        
        return row_positions, col_positions
    
    def analyze_wells(
        self,
        image: np.ndarray,
        row_positions: List[int],
        col_positions: List[int],
        well_radius: int = 20
    ) -> List[WellData]:
        """
        Extract color data from each well
        
        Args:
            image: Perspective-corrected plate image
            row_positions: Y-coordinates of well rows
            col_positions: X-coordinates of well columns
            well_radius: Radius of well sampling area
            
        Returns:
            List of WellData objects
        """
        wells_data = []
        row_labels = 'ABCDEFGH'
        
        for i, y in enumerate(row_positions):
            for j, x in enumerate(col_positions):
                # Create circular mask for well
                mask = np.zeros(image.shape[:2], dtype=np.uint8)
                cv2.circle(mask, (x, y), well_radius, 255, -1)
                
                # Extract pixels within the well
                well_pixels = image[mask == 255]
                
                if len(well_pixels) == 0:
                    continue
                
                # Calculate RGB statistics
                rgb_mean = tuple(np.mean(well_pixels, axis=0).astype(float))
                rgb_median = tuple(np.median(well_pixels, axis=0).astype(float))
                
                # Convert to grayscale intensity
                gray_pixels = cv2.cvtColor(well_pixels.reshape(-1, 1, 3), cv2.COLOR_BGR2GRAY)
                intensity = float(np.mean(gray_pixels))
                
                # Calculate optical density (OD)
                # OD = -log10(I/I0) where I0 is max intensity (255)
                # For dark wells: higher OD, for light wells: lower OD
                od = -np.log10((intensity + 1) / 256.0)  # Add 1 to avoid log(0)
                
                well_data = WellData(
                    row=i,
                    col=j,
                    position=f"{row_labels[i]}{j+1}",
                    center=(x, y),
                    rgb_mean=rgb_mean,
                    rgb_median=rgb_median,
                    intensity=intensity,
                    optical_density=float(od)
                )
                
                wells_data.append(well_data)
        
        return wells_data
    
    def check_alignment(self, image_path: str) -> Dict:
        """
        Quick check if the ELISA plate is aligned within the expected guide area.
        Used for real-time camera feedback.

        Args:
            image_path: Path to image file

        Returns:
            Alignment status dictionary
        """
        image = cv2.imread(image_path)
        if image is None:
            return {"aligned": False, "reason": "Could not load image"}

        # Resize for speed
        h, w = image.shape[:2]
        scale = 480 / max(h, w)
        small = cv2.resize(image, (int(w * scale), int(h * scale)))
        sh, sw = small.shape[:2]

        # Preprocess
        small = normalize_lighting(small)

        # Detect plate using robust method
        corners = self._detect_plate_robust(small)
        if corners is None:
            return {"aligned": False, "reason": "No plate detected"}

        # Check alignment criteria (all values cast to Python types):
        # 1. Plate should be roughly centered
        plate_center_x = float(np.mean(corners[:, 0]))
        plate_center_y = float(np.mean(corners[:, 1]))
        image_center_x = sw / 2.0
        image_center_y = sh / 2.0

        center_offset_x = abs(plate_center_x - image_center_x) / sw
        center_offset_y = abs(plate_center_y - image_center_y) / sh
        is_centered = bool(center_offset_x < 0.15 and center_offset_y < 0.15)

        # 2. Plate should fill a good portion of the image
        plate_width = float(np.max(corners[:, 0]) - np.min(corners[:, 0]))
        plate_height = float(np.max(corners[:, 1]) - np.min(corners[:, 1]))
        width_ratio = plate_width / sw
        height_ratio = plate_height / sh
        good_size = bool(width_ratio > 0.50 and height_ratio > 0.30)

        # 3. Plate should not be too tilted
        top_left, top_right = corners[0], corners[1]
        bottom_left = corners[3]

        top_angle = float(abs(np.degrees(np.arctan2(
            top_right[1] - top_left[1],
            top_right[0] - top_left[0]
        ))))
        left_angle = float(abs(np.degrees(np.arctan2(
            bottom_left[0] - top_left[0],
            bottom_left[1] - top_left[1]
        ))))
        is_straight = bool(top_angle < 7.0 and left_angle < 7.0)

        # 4. Aspect ratio should be close to 3:2 (standard 96-well plate)
        aspect_ratio = float(plate_width / plate_height) if plate_height > 0 else 0.0
        good_aspect = bool(1.1 < aspect_ratio < 2.0)

        aligned = is_centered and good_size and is_straight and good_aspect

        reasons = []
        if not is_centered:
            reasons.append("Plate not centered")
        if not good_size:
            reasons.append("Plate too small or too far")
        if not is_straight:
            reasons.append("Plate is tilted")
        if not good_aspect:
            reasons.append("Plate aspect ratio incorrect")

        return {
            "aligned": aligned,
            "reason": "; ".join(reasons) if reasons else "Aligned",
            "details": {
                "centered": is_centered,
                "good_size": good_size,
                "straight": is_straight,
                "good_aspect": good_aspect,
                "center_offset": [center_offset_x, center_offset_y],
                "size_ratio": [width_ratio, height_ratio],
                "top_angle": top_angle,
                "aspect_ratio": aspect_ratio,
            }
        }

    def analyze_image(self, image_path: str) -> Dict:
        """
        Complete analysis pipeline
        
        Args:
            image_path: Path to image file
            
        Returns:
            Analysis results dictionary
        """
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Could not load image: {image_path}")
        
        # Assess quality
        quality = assess_image_quality(image)
        
        # Preprocess
        image = normalize_lighting(image)
        
        # Detect plate
        corners = self.detect_plate(image)
        if corners is None:
            return {
                "success": False,
                "error": "Could not detect ELISA plate in image",
                "quality": quality
            }
        
        # Correct perspective
        corrected = correct_perspective(image, corners, output_size=(1200, 900))
        
        # Detect grid
        row_positions, col_positions = self.detect_grid(corrected)
        
        # Analyze wells
        wells_data = self.analyze_wells(corrected, row_positions, col_positions)
        
        # Format results
        results = {
            "success": True,
            "quality": quality,
            "plate_detected": True,
            "wells_detected": len(wells_data),
            "expected_wells": self.total_wells,
            "wells": [
                {
                    "position": well.position,
                    "row": well.row,
                    "col": well.col,
                    "rgb_mean": list(well.rgb_mean),
                    "rgb_median": list(well.rgb_median),
                    "intensity": well.intensity,
                    "optical_density": well.optical_density
                }
                for well in wells_data
            ]
        }
        
        return results
