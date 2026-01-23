#!/usr/bin/env bun

const BASE_URL = process.env.API_URL || 'http://localhost:3003';

async function testEndpoint(name: string, path: string) {
  try {
    console.log(`\n🧪 Testing ${name}...`);
    const response = await fetch(`${BASE_URL}${path}`);
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ ${name} - Success`);
      console.log(`   Response keys:`, Object.keys(data).join(', '));
      
      if (data.totalRisks !== undefined) {
        console.log(`   Total Risks: ${data.totalRisks}`);
      }
      if (data.totalControls !== undefined) {
        console.log(`   Total Controls: ${data.totalControls}`);
      }
      if (data.total !== undefined) {
        console.log(`   Total: ${data.total}`);
      }
      if (data.totalProcesses !== undefined) {
        console.log(`   Total Processes: ${data.totalProcesses}`);
      }
      if (data.totalRequirements !== undefined) {
        console.log(`   Total Requirements: ${data.totalRequirements}`);
      }
      
      return { success: true, data };
    } else {
      console.log(`❌ ${name} - Error ${response.status}`);
      console.log(`   Message:`, data.message || data.error);
      return { success: false, error: data };
    }
  } catch (error) {
    console.log(`❌ ${name} - Exception`);
    console.log(`   Error:`, error instanceof Error ? error.message : String(error));
    return { success: false, error };
  }
}

async function main() {
  console.log('🚀 Testing Auditor Analytics Endpoints');
  console.log(`📍 Base URL: ${BASE_URL}\n`);

  const healthCheck = await fetch(`${BASE_URL}/health`);
  if (!healthCheck.ok) {
    console.log('❌ Server is not running or not accessible');
    console.log('   Please start the server with: bun dev');
    process.exit(1);
  }
  console.log('✅ Server is running\n');

  const results = await Promise.all([
    testEndpoint('Portfolio Overview', '/analytics/audit/portfolio'),
    testEndpoint('Risk Exposure', '/analytics/audit/risk-exposure'),
    testEndpoint('Control Effectiveness', '/analytics/audit/control-effectiveness'),
    testEndpoint('Failure Modes', '/analytics/audit/failure-modes'),
    testEndpoint('Finding Trends', '/analytics/audit/findings'),
    testEndpoint('Compliance Status', '/analytics/audit/compliance'),
    testEndpoint('Process Health', '/analytics/audit/process-health'),
  ]);

  const successCount = results.filter(r => r.success).length;
  const totalCount = results.length;

  console.log(`\n📊 Results: ${successCount}/${totalCount} endpoints working`);
  
  if (successCount === totalCount) {
    console.log('✅ All endpoints are working!');
  } else {
    console.log('⚠️  Some endpoints failed. Check server logs for details.');
  }
}

main().catch(console.error);


