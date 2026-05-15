"""
Calibration service for ELISA plate analysis
Handles standard curve fitting and concentration calculations
"""
import numpy as np
from scipy.optimize import curve_fit
from scipy import stats
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass


@dataclass
class CalibrationPoint:
    """A single calibration point"""
    concentration: float
    od_value: float
    position: str


@dataclass
class CalibrationCurve:
    """Calibration curve data"""
    points: List[CalibrationPoint]
    curve_type: str  # 'linear', 'polynomial', 'logarithmic', '4pl'
    coefficients: List[float]
    r_squared: float
    equation: str


class CalibrationService:
    """Service for calibration and quantification"""
    
    @staticmethod
    def four_parameter_logistic(x: np.ndarray, a: float, b: float, c: float, d: float) -> np.ndarray:
        """
        Four-parameter logistic (4PL) curve
        Commonly used for ELISA calibration
        
        y = d + (a - d) / (1 + (x/c)^b)
        
        Args:
            x: Concentration values
            a: Min asymptote
            b: Hill slope
            c: Inflection point
            d: Max asymptote
        """
        return d + (a - d) / (1 + (x / c) ** b)
    
    def fit_curve(
        self,
        concentrations: List[float],
        od_values: List[float],
        curve_type: str = 'auto'
    ) -> CalibrationCurve:
        """
        Fit calibration curve to data
        
        Args:
            concentrations: Known concentrations
            od_values: Measured OD values
            curve_type: Type of curve ('auto', 'linear', 'polynomial', 'logarithmic', '4pl')
            
        Returns:
            Fitted calibration curve
        """
        x = np.array(concentrations)
        y = np.array(od_values)
        
        if curve_type == 'auto':
            # Try different models and select best fit
            models = ['linear', 'polynomial', '4pl']
            best_curve = None
            best_r2 = -np.inf
            
            for model in models:
                try:
                    curve = self._fit_specific_curve(x, y, model)
                    if curve.r_squared > best_r2:
                        best_r2 = curve.r_squared
                        best_curve = curve
                except Exception:
                    continue
            
            if best_curve is None:
                # Fallback to linear
                return self._fit_specific_curve(x, y, 'linear')
            
            return best_curve
        else:
            return self._fit_specific_curve(x, y, curve_type)
    
    def _fit_specific_curve(
        self,
        x: np.ndarray,
        y: np.ndarray,
        curve_type: str
    ) -> CalibrationCurve:
        """Fit a specific curve type"""
        
        points = [
            CalibrationPoint(conc, od, f"Std{i+1}")
            for i, (conc, od) in enumerate(zip(x, y))
        ]
        
        if curve_type == 'linear':
            # Linear regression: y = mx + b
            slope, intercept, r_value, _, _ = stats.linregress(x, y)
            coefficients = [slope, intercept]
            r_squared = r_value ** 2
            equation = f"OD = {slope:.4f} * [C] + {intercept:.4f}"
            
        elif curve_type == 'polynomial':
            # 2nd degree polynomial: y = ax^2 + bx + c
            coefficients = np.polyfit(x, y, 2)
            y_pred = np.polyval(coefficients, x)
            r_squared = self._calculate_r_squared(y, y_pred)
            equation = f"OD = {coefficients[0]:.4e}*[C]² + {coefficients[1]:.4f}*[C] + {coefficients[2]:.4f}"
            
        elif curve_type == 'logarithmic':
            # Logarithmic: y = a*log(x) + b
            log_x = np.log10(x + 1e-10)  # Avoid log(0)
            slope, intercept, r_value, _, _ = stats.linregress(log_x, y)
            coefficients = [slope, intercept]
            r_squared = r_value ** 2
            equation = f"OD = {slope:.4f} * log([C]) + {intercept:.4f}"
            
        elif curve_type == '4pl':
            # Four-parameter logistic
            # Initial parameter guesses
            a_init = np.min(y)
            d_init = np.max(y)
            c_init = np.median(x)
            b_init = 1.0
            
            p0 = [a_init, b_init, c_init, d_init]
            
            try:
                coefficients, _ = curve_fit(
                    self.four_parameter_logistic,
                    x, y,
                    p0=p0,
                    maxfev=10000
                )
                
                y_pred = self.four_parameter_logistic(x, *coefficients)
                r_squared = self._calculate_r_squared(y, y_pred)
                
                a, b, c, d = coefficients
                equation = f"OD = {d:.4f} + ({a:.4f} - {d:.4f}) / (1 + ([C]/{c:.4f})^{b:.4f})"
            except Exception as e:
                # Fallback to polynomial
                return self._fit_specific_curve(x, y, 'polynomial')
        else:
            raise ValueError(f"Unknown curve type: {curve_type}")
        
        return CalibrationCurve(
            points=points,
            curve_type=curve_type,
            coefficients=list(coefficients),
            r_squared=float(r_squared),
            equation=equation
        )
    
    def calculate_concentration(
        self,
        od_value: float,
        curve: CalibrationCurve
    ) -> Optional[float]:
        """
        Calculate concentration from OD value using calibration curve
        
        Args:
            od_value: Measured optical density
            curve: Calibration curve
            
        Returns:
            Calculated concentration or None if outside curve range
        """
        if curve.curve_type == 'linear':
            slope, intercept = curve.coefficients
            if abs(slope) < 1e-10:
                return None
            concentration = (od_value - intercept) / slope
            
        elif curve.curve_type == 'polynomial':
            # Solve quadratic equation: ax^2 + bx + c - od = 0
            a, b, c = curve.coefficients
            coeffs = [a, b, c - od_value]
            roots = np.roots(coeffs)
            
            # Select positive real root
            real_roots = roots[np.isreal(roots)].real
            positive_roots = real_roots[real_roots > 0]
            
            if len(positive_roots) == 0:
                return None
            concentration = float(positive_roots[0])
            
        elif curve.curve_type == 'logarithmic':
            slope, intercept = curve.coefficients
            if abs(slope) < 1e-10:
                return None
            log_conc = (od_value - intercept) / slope
            concentration = 10 ** log_conc
            
        elif curve.curve_type == '4pl':
            # Numerical solution for 4PL
            a, b, c, d = curve.coefficients
            
            # Check if OD is within curve range
            if not (min(a, d) <= od_value <= max(a, d)):
                return None
            
            # Solve iteratively using Newton's method
            # Start from inflection point
            x = c
            for _ in range(100):
                fx = self.four_parameter_logistic(x, *curve.coefficients) - od_value
                
                # Derivative
                if abs(x) < 1e-10:
                    break
                    
                dfx = -b * (a - d) * (x / c) ** b / (x * (1 + (x / c) ** b) ** 2)
                
                if abs(dfx) < 1e-10:
                    break
                
                x_new = x - fx / dfx
                
                if abs(x_new - x) < 1e-6:
                    x = x_new
                    break
                    
                x = x_new
            
            concentration = float(x)
        else:
            return None
        
        # Validate concentration is positive
        if concentration < 0:
            return None
            
        return float(concentration)
    
    @staticmethod
    def _calculate_r_squared(y_true: np.ndarray, y_pred: np.ndarray) -> float:
        """Calculate R-squared value"""
        ss_res = np.sum((y_true - y_pred) ** 2)
        ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
        
        if ss_tot < 1e-10:
            return 0.0
        
        r_squared = 1 - (ss_res / ss_tot)
        return float(r_squared)
    
    def validate_curve(self, curve: CalibrationCurve) -> Dict:
        """
        Validate calibration curve quality
        
        Args:
            curve: Calibration curve to validate
            
        Returns:
            Validation results
        """
        is_valid = True
        issues = []
        
        # Check R-squared
        if curve.r_squared < 0.95:
            issues.append(f"Low R² value ({curve.r_squared:.3f} < 0.95)")
            if curve.r_squared < 0.90:
                is_valid = False
        
        # Check number of points
        if len(curve.points) < 3:
            issues.append(f"Too few calibration points ({len(curve.points)} < 3)")
            is_valid = False
        
        # Check for outliers
        concentrations = [p.concentration for p in curve.points]
        od_values = [p.od_value for p in curve.points]
        
        # Calculate CV% (coefficient of variation)
        if len(curve.points) > 2:
            od_std = np.std(od_values)
            od_mean = np.mean(od_values)
            if od_mean > 0:
                cv_percent = (od_std / od_mean) * 100
                if cv_percent > 20:
                    issues.append(f"High variability (CV% = {cv_percent:.1f}%)")
        
        return {
            "is_valid": is_valid,
            "r_squared": curve.r_squared,
            "n_points": len(curve.points),
            "curve_type": curve.curve_type,
            "equation": curve.equation,
            "issues": issues if issues else None
        }
