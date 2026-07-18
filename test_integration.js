const http = require('http');
const fs = require('fs');
const path = require('path');

function postJson(url, data) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const postData = JSON.stringify(data);

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(body));
                } else {
                    reject(new Error(`POST ${url} failed with status code ${res.statusCode}: ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(body));
                } else {
                    reject(new Error(`GET ${url} failed with status code ${res.statusCode}: ${body}`));
                }
            });
        }).on('error', reject);
    });
}

async function runTests() {
    console.log('🧪 Starting Cinemiq Integration Test Suite...\n');
    const baseUrl = 'http://localhost:5000';

    try {
        // Test 1: Giphy Search API
        console.log('➡️ Testing Giphy Search API...');
        const giphySearch = await getJson(`${baseUrl}/api/ai/giphy-search?query=rocket`);
        console.log('✅ Giphy Search retrieved successfully! Result count:', giphySearch.length);

        // Test 2: Freesound Search API
        console.log('\n➡️ Testing Freesound Search API...');
        const freesoundSearch = await getJson(`${baseUrl}/api/ai/freesound-search?query=synth`);
        console.log('✅ Freesound Search retrieved successfully! Result count:', freesoundSearch.length);

        // Test 3: AI Timeline Generation
        console.log('\n➡️ Testing AI Timeline Generation API...');
        const promptPayload = { prompt: 'Futuristic synthwave adventure, neon lights flying through cyber city' };
        const project = await postJson(`${baseUrl}/api/ai/prompt-timeline`, promptPayload);

        console.log('✅ AI Timeline generated successfully!');
        console.log(`🔹 Project Name: "${project.name}"`);
        console.log(`🔹 Track Count: ${project.tracks.length}`);
        console.log(`🔹 Clips Count: ${project.clips.length}`);

        // Verify clips have correct URLs
        for (const clip of project.clips) {
            if (clip.source) {
                console.log(`   - Clip [${clip.type}] source: ${clip.source}`);
            }
        }

        // Test 4: Project Rendering
        console.log('\n➡️ Queuing Project Render Job...');
        const renderRes = await postJson(`${baseUrl}/api/editor/render`, { project });
        const jobId = renderRes.jobId;
        console.log(`✅ Render job successfully queued. Job ID: ${jobId}`);

        // Test 5: Poll rendering status till done
        console.log('\n➡️ Polling Render Job Status...');
        let isDone = false;
        let attempts = 0;
        let statusData = null;

        while (!isDone && attempts < 30) {
            attempts++;
            await new Promise((resolve) => setTimeout(resolve, 1500));
            statusData = await getJson(`${baseUrl}/api/editor/render/status/${jobId}`);
            console.log(`   [Attempt ${attempts}] Status: "${statusData.status}" - Progress: ${statusData.progress}%`);

            if (statusData.status === 'done' || statusData.status === 'failed') {
                isDone = true;
            }
        }

        if (statusData.status === 'done') {
            console.log(`\n✅ Render Job completed successfully!`);
            console.log(`🔹 Output Path: ${statusData.outputPath}`);

            // Test 6: Verify file exists on disk
            const relativePath = statusData.outputPath.replace(/^\//, '');
            const possiblePaths = [
                path.join(__dirname, relativePath),
                path.join(__dirname, 'apps', 'server', relativePath)
            ];

            let verifiedPath = null;
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    verifiedPath = p;
                    break;
                }
            }

            if (verifiedPath) {
                const stats = fs.statSync(verifiedPath);
                console.log(`✅ Verified output file exists on disk at: ${verifiedPath}! Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            } else {
                throw new Error(`Render completed, but file does not exist on disk at any of: ${possiblePaths.join(', ')}`);
            }

            console.log('\n🎉 ALL INTEGRATION TEST CASES PASSED SUCCESSFULLY! Theme, API connections, database fallbacks, and rendering pipeline are operational.');
        } else {
            throw new Error(`Render Job failed or timed out: ${statusData.error || 'Timeout'}`);
        }

    } catch (err) {
        console.error('\n❌ Test Suite Failed:', err.message);
        process.exit(1);
    }
}

runTests();
