import axios from 'axios';
import { API_BASE_URL, API_TIMEOUT, ENDPOINTS } from '../config/api';
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: API_TIMEOUT,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const analyzeImage = async (imageUri) => {
    try {
        // Create form data
        const formData = new FormData();

        // Handle web vs mobile differently
        if (imageUri.startsWith('blob:') || imageUri.startsWith('http')) {
            // Web platform - fetch the blob and append as File
            const response = await fetch(imageUri);
            const blob = await response.blob();

            // Create a proper filename
            const filename = `plate_${Date.now()}.jpg`;

            // Append as File object for web
            formData.append('file', blob, filename);
        } else {
            // Mobile platform - use native file upload format
            const filename = imageUri.split('/').pop();
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : 'image/jpeg';

            formData.append('file', {
                uri: imageUri,
                name: filename,
                type: type,
            });
        }

        const response = await apiClient.post(ENDPOINTS.ANALYZE, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
            timeout: 60000, // 60 seconds for image analysis
        });

        return response.data;
    } catch (error) {
        console.error('Analysis error:', error);
        console.error('Error response:', error.response?.data);

        // Better error message extraction
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
    testConnection,
};
