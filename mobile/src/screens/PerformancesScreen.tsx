import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import eventsData from '../data/events.json';
import venuesData from '../data/venues.json';

export default function PerformancesScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Performances</Text>
        
        {/* Festivals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Festivals</Text>
          {eventsData.festivals.map((festival) => (
            <View key={festival.id} style={styles.card}>
              <Text style={styles.cardTitle}>{festival.name}</Text>
              <Text style={styles.cardLocation}>{festival.location}</Text>
              <Text style={styles.cardYear}>{festival.year}</Text>
            </View>
          ))}
        </View>

        {/* Venues */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Venues</Text>
          {venuesData.venues.map((venue) => (
            <View key={venue.id} style={styles.card}>
              <Text style={styles.cardTitle}>{venue.name}</Text>
              <Text style={styles.cardLocation}>{venue.city}</Text>
              <View style={styles.venueTypeContainer}>
                <Text style={styles.venueType}>{venue.type}</Text>
              </View>
              {venue.description && (
                <Text style={styles.cardDescription}>{venue.description}</Text>
              )}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    padding: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  cardLocation: {
    fontSize: 14,
    color: '#999',
    marginBottom: 4,
  },
  cardYear: {
    fontSize: 12,
    color: '#666',
  },
  venueTypeContainer: {
    alignSelf: 'flex-start',
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 8,
    marginBottom: 8,
  },
  venueType: {
    fontSize: 12,
    color: '#999',
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
});

