import axios from 'axios';
import { API_BASE_URL, API_TIMEOUT, ENDPOINTS } from '../config/api';
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: API_TIMEOUT,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const analyzeImage = async (imageUri, { negativeControl, positiveControl, chromogen, assayType } = {}) => {
    try {
        const formData = new FormData();

        if (imageUri.startsWith('blob:') || imageUri.startsWith('http')) {
            const response = await fetch(imageUri);
            const blob = await response.blob();
            const filename = `plate_${Date.now()}.jpg`;
            formData.append('file', blob, filename);
        } else {
            const filename = imageUri.split('/').pop();
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : 'image/jpeg';
            formData.append('file', {
                uri: imageUri,
                name: filename,
                type: type,
            });
        }

        if (negativeControl && negativeControl.length > 0) {
            formData.append('negative_control', negativeControl.join(','));
        }
        if (positiveControl && positiveControl.length > 0) {
            formData.append('positive_control', positiveControl.join(','));
        }
        if (chromogen) {
            formData.append('chromogen', chromogen);
        }
        if (assayType) {
            formData.append('assay_type', assayType);
        }

        const response = await apiClient.post(ENDPOINTS.ANALYZE, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            timeout: 60000,
        });

        return response.data;
    } catch (error) {
        console.error('Analysis error:', error);
        console.error('Error response:', error.response?.data);

        const errorMessage = error.response?.data?.detail ||
            error.response?.data?.message ||
            error.message ||
            'Failed to analyze image. Please check your connection and try again.';

        throw new Error(errorMessage);
    }
};

export const getResults = async (analysisId) => {
    try {
        const response = await apiClient.get(`${ENDPOINTS.RESULTS}/${analysisId}`);
        return response.data;
    } catch (error) {
        console.error('Get results error:', error.response?.data || error.message);
        throw new Error('Failed to retrieve results');
    }
};

export const createCalibration = async (concentrations, odValues, curveType = 'auto') => {
    try {
        const response = await apiClient.post(ENDPOINTS.CALIBRATE, {
            concentrations,
            od_values: odValues,
            curve_type: curveType,
        });

        return response.data;
    } catch (error) {
        console.error('Calibration error:', error.response?.data || error.message);
        throw new Error(
            error.response?.data?.detail ||
            'Failed to create calibration curve'
        );
    }
};

export const quantifySamples = async (calibrationId, odValues) => {
    try {
        const response = await apiClient.post(ENDPOINTS.QUANTIFY, {
            calibration_id: calibrationId,
            od_values: odValues,
        });

        return response.data;
    } catch (error) {
        console.error('Quantification error:', error.response?.data || error.message);
        throw new Error('Failed to quantify samples');
    }
};

export const listCalibrations = async () => {
    try {
        const response = await apiClient.get(ENDPOINTS.CALIBRATIONS);
        return response.data;
    } catch (error) {
        console.error('List calibrations error:', error.response?.data || error.message);
        throw new Error('Failed to retrieve calibrations');
    }
};

export const deleteResults = async (analysisId) => {
    try {
        const response = await apiClient.delete(`${ENDPOINTS.RESULTS}/${analysisId}`);
        return response.data;
    } catch (error) {
        console.error('Delete error:', error.response?.data || error.message);
        throw new Error('Failed to delete results');
    }
};

export const checkAlignment = async (imageUri) => {
    try {
        const formData = new FormData();

        if (imageUri.startsWith('blob:') || imageUri.startsWith('http')) {
            const response = await fetch(imageUri);
            const blob = await response.blob();
            formData.append('file', blob, `frame_${Date.now()}.jpg`);
        } else {
            const filename = imageUri.split('/').pop();
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : 'image/jpeg';
            formData.append('file', { uri: imageUri, name: filename, type });
        }

        const response = await apiClient.post(ENDPOINTS.CHECK_ALIGNMENT, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 10000,
        });

        return response.data;
    } catch (error) {
        console.error('Alignment check error:', error.message);
        return { aligned: false, reason: 'Connection error' };
    }
};

export const exportResults = async (analysisId) => {
    try {
        const response = await apiClient.get(`${ENDPOINTS.EXPORT}/${analysisId}`, {
            responseType: 'text',
        });
        return response.data;
    } catch (error) {
        console.error('Export error:', error.response?.data || error.message);
        throw new Error('Failed to export results');
    }
};

export const generateSerialDilution = async (startConcentration, dilutionFactor = 2.0, nPoints = 7, includeZero = true) => {
    try {
        const response = await apiClient.post(ENDPOINTS.SERIAL_DILUTION, {
            start_concentration: startConcentration,
            dilution_factor: dilutionFactor,
            n_points: nPoints,
            include_zero: includeZero,
        });
        return response.data;
    } catch (error) {
        console.error('Serial dilution error:', error.response?.data || error.message);
        throw new Error('Failed to generate serial dilution');
    }
};

export const getReplicateStats = async (wells, groups) => {
    try {
        const response = await apiClient.post(ENDPOINTS.REPLICATE_STATS, {
            wells,
            groups,
        });
        return response.data;
    } catch (error) {
        console.error('Replicate stats error:', error.response?.data || error.message);
        throw new Error('Failed to calculate replicate stats');
    }
};

export const uploadDatasetPlate = async (imageUri, metadata = {}) => {
    try {
        const formData = new FormData();
        if (imageUri.startsWith('blob:') || imageUri.startsWith('http')) {
            const response = await fetch(imageUri);
            const blob = await response.blob();
            formData.append('file', blob, `dataset_plate_${Date.now()}.jpg`);
        } else {
            const filename = imageUri.split('/').pop() || `dataset_plate_${Date.now()}.jpg`;
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : 'image/jpeg';
            formData.append('file', { uri: imageUri, name: filename, type });
        }

        Object.entries(metadata).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                formData.append(key, String(value));
            }
        });

        const response = await apiClient.post(ENDPOINTS.DATASET_PLATES, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60000,
        });
        return response.data;
    } catch (error) {
        console.error('Dataset upload error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.detail || 'Failed to upload dataset plate');
    }
};

export const listDatasetPlates = async () => {
    try {
        const response = await apiClient.get(ENDPOINTS.DATASET_PLATES);
        return response.data;
    } catch (error) {
        console.error('Dataset list error:', error.response?.data || error.message);
        throw new Error('Failed to list dataset plates');
    }
};

export const attachReaderCsvText = async (plateId, csvText) => {
    try {
        const formData = new FormData();
        formData.append('csv_text', csvText);
        const response = await apiClient.post(`${ENDPOINTS.DATASET_PLATES}/${plateId}/reader-csv`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
        });
        return response.data;
    } catch (error) {
        console.error('Reader CSV attach error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.detail || 'Failed to attach reader CSV');
    }
};

export const exportDatasetManifest = async () => {
    try {
        const response = await apiClient.get(ENDPOINTS.DATASET_MANIFEST, {
            responseType: 'text',
        });
        return response.data;
    } catch (error) {
        console.error('Dataset manifest error:', error.response?.data || error.message);
        throw new Error('Failed to export dataset manifest');
    }
};

export const testConnection = async () => {
    try {
        const response = await axios.get(`${API_BASE_URL.replace('/api', '')}/health`, {
            timeout: 5000,
        });
        return response.status === 200;
    } catch (error) {
        console.error('Connection test failed:', error.message);
        return false;
    }
};

export default {
    analyzeImage,
    getResults,
    createCalibration,
    quantifySamples,
    listCalibrations,
    deleteResults,
    checkAlignment,
    exportResults,
    generateSerialDilution,
    getReplicateStats,
    uploadDatasetPlate,
    listDatasetPlates,
    attachReaderCsvText,
    exportDatasetManifest,
    testConnection,
};
