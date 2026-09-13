/**
 * Agent Performance Monitor
 * Tracks and reports on agent team performance
 */

import { EnhancedPipelineOrchestrator } from './sonicDNAAgents'

const orchestrator = new EnhancedPipelineOrchestrator()

/**
 * Get performance report
 */
export function getPerformanceReport() {
  const stats = orchestrator.getPerformanceStats()
  const cacheStats = orchestrator.getCacheStats()

  return {
    agentPerformance: stats,
    cache: cacheStats,
    timestamp: new Date().toISOString()
  }
}

/**
 * Log performance summary
 */
export function logPerformanceSummary() {
  const report = getPerformanceReport()
  
  console.log('\n📊 Agent Team Performance Report')
  console.log('='.repeat(60))
  
  if (Object.keys(report.agentPerformance).length > 0) {
    console.log('\n⏱️  Processing Times:')
    Object.entries(report.agentPerformance).forEach(([agent, stats]) => {
      console.log(`   ${agent}:`)
      console.log(`      Avg: ${stats.avg}ms`)
      console.log(`      Min: ${stats.min}ms`)
      console.log(`      Max: ${stats.max}ms`)
    })
  }
  
  console.log(`\n💾 Cache: ${report.cache.size} entries`)
  console.log(`📅 Report Time: ${report.timestamp}`)
  console.log('='.repeat(60))
}

