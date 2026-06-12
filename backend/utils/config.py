"""
Configuration settings for the backend
"""
from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import List


class Settings(BaseSettings):
    """Application settings"""
    model_config = ConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = False
    
    # CORS — "*" in dev allows physical-device testing over LAN
    CORS_ORIGINS: List[str] = ["*"]
    
    # File storage
    UPLOAD_DIR: str = "./uploads"
    RESULTS_DIR: str = "./results"
    DATASET_DIR: str = "./dataset"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    
    # ELISA plate configuration
    PLATE_ROWS: int = 8
    PLATE_COLS: int = 12
    TOTAL_WELLS: int = 96
    
settings = Settings()
