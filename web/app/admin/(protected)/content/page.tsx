'use client'

import { useState, useEffect } from 'react'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { useRouter } from 'next/navigation'

export default function AdminContent() {
  const { user, isAdmin, loading } = useAdminAuth()
  const router = useRouter()
if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  const contentPages = [
    { name: 'Home', path: '/', editable: true },
    { name: 'About', path: '/about', editable: true },
    { name: 'Music', path: '/music', editable: true },
    { name: 'Gallery', path: '/gallery', editable: true },
    { name: 'Videos', path: '/videos', editable: true },
    { name: 'Contact', path: '/contact', editable: true },
  ]

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Content Management</h1>
          <p className="text-gray-400">Manage your website content and pages</p>
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-6">Pages</h2>
          
          <div className="space-y-3">
            {contentPages.map((page) => (
              <div
                key={page.path}
                className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-purple-500 transition flex items-center justify-between"
              >
                <div>
                  <h3 className="text-lg font-semibold">{page.name}</h3>
                  <p className="text-gray-400 text-sm">{page.path}</p>
                </div>
                <div className="flex space-x-2">
                  <a
                    href={page.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white px-3 py-1 rounded transition"
                  >
                    View
                  </a>
                  {page.editable && (
                    <button className="text-purple-400 hover:text-purple-300 px-3 py-1 rounded transition">
                      Edit
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
