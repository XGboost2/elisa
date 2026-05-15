"""
Image preprocessing utilities for ELISA plate analysis
"""
import cv2
import numpy as np
from typing import Tuple, Optional


def normalize_lighting(image: np.ndarray) -> np.ndarray:
    """
    Normalize lighting across the image using CLAHE
    
    Args:
        image: Input BGR image
        
    Returns:
        Lighting-normalized image
    """
    # Convert to LAB color space
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    
    # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    
    # Merge and convert back to BGR
    lab = cv2.merge([l, a, b])
    normalized = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    
    return normalized


def reduce_noise(image: np.ndarray, kernel_size: int = 5) -> np.ndarray:
    """
    Apply Gaussian blur to reduce noise
    
    Args:
        image: Input image
        kernel_size: Size of Gaussian kernel (must be odd)
        
    Returns:
        Denoised image
    """
    return cv2.GaussianBlur(image, (kernel_size, kernel_size), 0)


def enhance_edges(image: np.ndarray) -> np.ndarray:
    """
    Enhance edges in the image for better detection
    
    Args:
        image: Input grayscale image
        
    Returns:
        Edge-enhanced image
    """
    # Apply bilateral filter to preserve edges while smoothing
    filtered = cv2.bilateralFilter(image, 9, 75, 75)
    
    # Apply sharpening kernel
    kernel = np.array([[-1, -1, -1],
                       [-1,  9, -1],
                       [-1, -1, -1]])
    sharpened = cv2.filter2D(filtered, -1, kernel)
    
    return sharpened


def correct_perspective(
    image: np.ndarray,
    corners: np.ndarray,
    output_size: Tuple[int, int] = (800, 600)
) -> np.ndarray:
    """
    Apply perspective correction using homography
    
    Args:
        image: Input image
        corners: Four corner points of the plate [top-left, top-right, bottom-right, bottom-left]
        output_size: Desired output size (width, height)
        
    Returns:
        Perspective-corrected image
    """
    width, height = output_size
    
    # Destination points for perspective transform
    dst_points = np.array([
        [0, 0],
        [width - 1, 0],
        [width - 1, height - 1],
        [0, height - 1]
    ], dtype=np.float32)
    
    # Compute perspective transform matrix
    matrix = cv2.getPerspectiveTransform(corners.astype(np.float32), dst_points)
    
    # Apply perspective transform
    corrected = cv2.warpPerspective(image, matrix, (width, height))
    
    return corrected


def assess_image_quality(image: np.ndarray) -> dict:
    """
    Assess image quality for ELISA plate analysis
    
    Args:
        image: Input image
        
    Returns:
        Dictionary with quality metrics
    """
    # Convert to grayscale if needed
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
    
    # Calculate sharpness using Laplacian variance
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    sharpness = float(laplacian.var())

    # Calculate brightness
    brightness = float(np.mean(gray))

    # Calculate contrast
    contrast = float(gray.std())

    # Determine if image is acceptable (cast to Python bool to avoid numpy.bool_)
    is_sharp = bool(sharpness > 100)
    is_bright_enough = bool(50 < brightness < 200)
    has_contrast = bool(contrast > 30)

    return {
        "sharpness": sharpness,
        "brightness": brightness,
        "contrast": contrast,
        "is_acceptable": is_sharp and is_bright_enough and has_contrast,
        "issues": [
            issue for issue in [
                "Image is blurry" if not is_sharp else None,
                "Image is too dark or overexposed" if not is_bright_enough else None,
                "Image has low contrast" if not has_contrast else None,
            ] if issue is not None
        ]
    }


def convert_to_rgb(image: np.ndarray) -> np.ndarray:
    """
    Ensure image is in RGB format
    
    Args:
        image: Input image (BGR or RGB)
        
    Returns:
        RGB image
    """
    if len(image.shape) == 2:
        # Grayscale to RGB
        return cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    elif image.shape[2] == 4:
        # RGBA to RGB
        return cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)
    else:
        # BGR to RGB
        return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
