import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './src/screens/HomeScreen';
import AboutScreen from './src/screens/AboutScreen';
import MusicScreen from './src/screens/MusicScreen';
import PerformancesScreen from './src/screens/PerformancesScreen';
import GalleryScreen from './src/screens/GalleryScreen';
import EPKScreen from './src/screens/EPKScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          tabBarStyle: { backgroundColor: '#000', borderTopColor: '#333' },
          tabBarActiveTintColor: '#fff',
          tabBarInactiveTintColor: '#666',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#fff',
        }}
      >
        <Tab.Screen 
          name="Home" 
          component={HomeScreen}
          options={{ tabBarIcon: () => <Text style={{ color: '#fff', fontSize: 20 }}>🏠</Text> }}
        />
        <Tab.Screen 
          name="About" 
          component={AboutScreen}
          options={{ tabBarIcon: () => <Text style={{ color: '#fff', fontSize: 20 }}>ℹ️</Text> }}
        />
        <Tab.Screen 
          name="Music" 
          component={MusicScreen}
          options={{ tabBarIcon: () => <Text style={{ color: '#fff', fontSize: 20 }}>🎵</Text> }}
        />
        <Tab.Screen 
          name="Performances" 
          component={PerformancesScreen}
          options={{ tabBarIcon: () => <Text style={{ color: '#fff', fontSize: 20 }}>🎤</Text> }}
        />
        <Tab.Screen 
          name="Gallery" 
          component={GalleryScreen}
          options={{ tabBarIcon: () => <Text style={{ color: '#fff', fontSize: 20 }}>📷</Text> }}
        />
        <Tab.Screen 
          name="EPK" 
          component={EPKScreen}
          options={{ tabBarIcon: () => <Text style={{ color: '#fff', fontSize: 20 }}>📄</Text> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

