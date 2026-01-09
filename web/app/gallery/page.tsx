import galleryData from '@/data/gallery.json'
import ImageGallery from '@/components/ImageGallery'

// Type assertion to ensure categories match the expected literal types
type GalleryImage = {
  id: string
  src: string
  alt: string
  category: 'portrait' | 'performance' | 'studio' | 'landscape'
  description?: string
}

export default function Gallery() {
  // Assert the type to fix TypeScript inference from JSON
  const images = galleryData.images as GalleryImage[]
  
  return (
    <div className="pt-20 min-h-screen bg-black">
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="max-w-4xl mx-auto mb-12">
          <h1 className="text-5xl md:text-6xl font-bold mb-4">Gallery</h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            Visual documentation of performances, studio sessions, and moments from the underground scene.
          </p>
        </div>
        <ImageGallery images={images} />
      </div>
    </div>
  )
}
