import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useFilteredGalleryImages } from '../hooks/useData';

// Memoize image item component for better performance
const ImageItem = React.memo(({ image, onPress }: { image: any; onPress: (src: string) => void }) => (
  <TouchableOpacity
    style={styles.imageContainer}
    onPress={() => onPress(image.src)}
    activeOpacity={0.8}
  >
    <Image
      source={{ uri: image.src }}
      style={styles.image}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={200}
    />
  </TouchableOpacity>
));

ImageItem.displayName = 'ImageItem';

export default function GalleryScreen() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  // Use optimized hook for filtered images
  const filteredImages = useFilteredGalleryImages(filter);

  // Memoize callback to prevent re-renders
  const handleImagePress = useCallback((src: string) => {
    setSelectedImage(src);
  }, []);

  // Optimize render item with useCallback
  const renderItem = useCallback(({ item }: { item: any }) => (
    <ImageItem image={item} onPress={handleImagePress} />
  ), [handleImagePress]);

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: any) => item.id, []);

  // Get item layout for better FlatList performance
  const getItemLayout = useCallback((_: any, index: number) => {
    const itemSize = 120; // Approximate item height including padding
    return {
      length: itemSize,
      offset: itemSize * Math.floor(index / 3),
      index,
    };
  }, []);

  const categories = useMemo(() => [
    { value: 'all', label: 'All' },
    { value: 'performance', label: 'Performance' },
    { value: 'portrait', label: 'Portrait' },
    { value: 'studio', label: 'Studio' },
    { value: 'landscape', label: 'Landscape' },
  ], []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gallery</Text>
        <Text style={styles.subtitle}>
          Visual documentation of performances and moments
        </Text>
      </View>

      {/* Filter Buttons */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.value}
            onPress={() => setFilter(cat.value)}
            style={[
              styles.filterButton,
              filter === cat.value && styles.filterButtonActive
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filter === cat.value && styles.filterTextActive
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Optimized FlatList for better performance */}
      <FlatList
        data={filteredImages}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={3}
        getItemLayout={getItemLayout}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={12}
        updateCellsBatchingPeriod={50}
        key={`grid-${filter}`}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      />

      {/* Modal */}
      <Modal
        visible={selectedImage !== null}
        transparent={true}
        onRequestClose={() => setSelectedImage(null)}
        animationType="fade"
      >
        <TouchableOpacity
          style={styles.modalContainer}
          activeOpacity={1}
          onPress={() => setSelectedImage(null)}
        >
          {selectedImage && (
            <Image
              source={{ uri: selectedImage }}
              style={styles.modalImage}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    paddingTop: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#999',
  },
  filterContainer: {
    marginBottom: 16,
  },
  filterContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
  },
  filterButtonActive: {
    backgroundColor: '#fff',
  },
  filterText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#000',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
  imageContainer: {
    width: '33.33%',
    aspectRatio: 1,
    padding: 4,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: '100%',
    height: '80%',
  },
});

