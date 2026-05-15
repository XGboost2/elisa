"""
Configuration settings for the backend
"""
from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings"""
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    DEBUG: bool = False
    
    # CORS — "*" in dev allows physical-device testing over LAN
    CORS_ORIGINS: List[str] = ["*"]
    
    # File storage
    UPLOAD_DIR: str = "./uploads"
    RESULTS_DIR: str = "./results"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    
    # ELISA plate configuration
    PLATE_ROWS: int = 8
    PLATE_COLS: int = 12
    TOTAL_WELLS: int = 96
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
