/**
 * Main App component with navigation
 */
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screens/HomeScreen';
import CameraScreen from './src/screens/CameraScreen';
import ResultsScreen from './src/screens/ResultsScreen';
import CalibrationScreen from './src/screens/CalibrationScreen';
import DatasetScreen from './src/screens/DatasetScreen';

const Stack = createNativeStackNavigator();

export default function App() {
    return (
        <NavigationContainer>
            <Stack.Navigator
                initialRouteName="Home"
                screenOptions={{
                    headerShown: false,
                }}
            >
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Camera" component={CameraScreen} />
                <Stack.Screen name="Results" component={ResultsScreen} />
                <Stack.Screen name="Calibration" component={CalibrationScreen} />
                <Stack.Screen name="Dataset" component={DatasetScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
