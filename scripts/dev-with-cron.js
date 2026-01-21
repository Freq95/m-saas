/**
 * Development script that starts Next.js dev server and Yahoo sync cron together
 * 
 * Usage: node scripts/dev-with-cron.js
 * Or: npm run dev:with-cron
 */

const { spawn } = require('child_process');
const path = require('path');
const fetch = require('node-fetch');

let detectedPort = null;

// Wait for server to be ready - checks ports 3000-3010 in reverse order
// (Next.js uses the highest available port when lower ones are taken)
async function waitForServer(maxAttempts = 60, delay = 2000) {
  // Check ports in reverse order since Next.js will use higher ports first
  const portsToCheck = Array.from({ length: 11 }, (_, i) => 3010 - i); // 3010 down to 3000
  
  // Give Next.js more time to start compiling before checking
  console.log('⏳ Waiting for Next.js to compile...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  for (let i = 0; i < maxAttempts; i++) {
    // Try each port in reverse sequence (higher ports first)
    for (const port of portsToCheck) {
      try {
        // First check if root responds
        const rootResponse = await Promise.race([
          fetch(`http://localhost:${port}/`, { method: 'GET' }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 3000)
          )
        ]);
        
        if (rootResponse && (rootResponse.ok || rootResponse.status === 404)) {
          // Check if it's Next.js by looking at content-type
          const contentType = rootResponse.headers.get('content-type') || '';
          const isHtml = contentType.includes('text/html');
          
          if (isHtml) {
            // Verify it's actually our Next.js by checking the cron endpoint
            // This ensures we get the correct Next.js instance (not an old one)
            try {
              const cronResponse = await Promise.race([
                fetch(`http://localhost:${port}/api/cron/yahoo-sync`, { method: 'GET' }),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Timeout')), 3000)
                )
              ]);
              
              // If the endpoint responds (even with error), it's our Next.js server
              // Status 200/400/500/501 means the route exists and Next.js handled it
              // Status 404 might mean it's not compiled yet, so check for Next.js error page
              if (cronResponse) {
                const body = await cronResponse.text();
                // Next.js error pages contain "missing required error components" or JSON errors
                // If we get any response that's not a connection error, it's our Next.js
                if (cronResponse.status !== 404 || body.includes('error') || body.includes('missing')) {
                  detectedPort = port;
                  console.log(`\n✅ Next.js server is ready on port ${port}!`);
                  return port;
                }
              }
            } catch (cronError) {
              // Endpoint might not be compiled yet, but root is Next.js
              // Since we're checking in reverse order, this might be the correct port
              // Continue checking to see if there's a higher port that's fully ready
              continue;
            }
          }
        }
      } catch (error) {
        // Server not ready on this port yet, continue checking
        continue;
      }
    }
    
    if (i < maxAttempts - 1) {
      process.stdout.write(`⏳ Waiting for server... (${i + 1}/${maxAttempts})\r`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return null;
}

console.log('🚀 Starting Next.js dev server...\n');

// Start Next.js dev server
const nextDev = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  cwd: path.join(__dirname, '..'),
});

let cronJob = null;

// Wait for server to be ready, then start cron
waitForServer().then((port) => {
  if (port) {
    console.log('🚀 Starting Yahoo sync cron job...\n');
    
    // Set the port as environment variable for the cron job
    const env = { ...process.env };
    env.NEXT_PUBLIC_API_URL = `http://localhost:${port}`;
    
    // Start Yahoo sync cron
    cronJob = spawn('node', [path.join(__dirname, 'sync-yahoo-cron.js')], {
      stdio: 'inherit',
      shell: true,
      cwd: path.join(__dirname, '..'),
      env: env,
    });

    // Handle cron job termination
    cronJob.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`\n❌ Cron job exited with code ${code}`);
      }
    });
  } else {
    console.error('\n❌ Server failed to start within timeout. Exiting...');
    nextDev.kill();
    process.exit(1);
  }
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  nextDev.kill();
  if (cronJob) {
    cronJob.kill();
  }
  process.exit();
});

process.on('SIGTERM', () => {
  nextDev.kill();
  if (cronJob) {
    cronJob.kill();
  }
  process.exit();
});

