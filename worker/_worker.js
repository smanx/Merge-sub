/**
 * Cloudflare Worker 版本 - 使用 KV 存储代替文件存储
 * 
 * 环境变量配置:
 * - USERNAME: 管理员用户名 (默认: admin)
 * - PASSWORD: 管理员密码 (默认: admin)
 * - API_URL: 订阅转换地址 (默认: https://sublink.eooce.com)
 * - CFIP: Cloudflare IP (可选)
 * - CFPORT: Cloudflare 端口 (可选)
 * 
 * KV 命名空间绑定:
 * - SUB_KV: 存储 subscriptions 和 nodes 数据
 */

// 初始化数据
const initialData = {
    subscriptions: [],
    nodes: ''
};

// 生成随机20位字符的函数
function generateRandomString() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 20; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 固定的默认 SUB_TOKEN，用于没有配置环境变量和 KV 的情况
const DEFAULT_SUB_TOKEN = 'merge-sub-default-token';

// 解析 Basic Auth
function parseBasicAuth(authHeader) {
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        return null;
    }
    try {
        const encoded = authHeader.substring(6);
        if (!encoded) {
            return null;
        }
        const credentials = atob(encoded);
        const parts = credentials.split(':');
        if (parts.length < 2) {
            return null;
        }
        const [username, password] = parts;
        return { username, password };
    } catch (error) {
        return null;
    }
}

// 验证身份
async function verifyAuth(request, env) {
    const credentials = await loadCredentials(env);
    
    // 如果没有配置账号密码，跳过验证
    if (!credentials) {
        return true;
    }
    
    const authHeader = request.headers.get('Authorization');
    const user = parseBasicAuth(authHeader);
    if (!user || user.username !== credentials.username || user.password !== credentials.password) {
        return false;
    }
    return true;
}

// 加载凭证
async function loadCredentials(env) {
    // 只有当环境变量配置了 USERNAME 和 PASSWORD 时才启用认证
    if (env.USERNAME && env.PASSWORD) {
        return {
            username: env.USERNAME,
            password: env.PASSWORD
        };
    }
    
    // 没有配置账号密码，返回 null 表示不需要认证
    return null;
}

// 保存凭证
// 加载数据
async function loadData(env) {
    try {
        // 检查 KV 是否存在
        if (env.SUB_KV) {
            const data = await env.SUB_KV.get('data', { type: 'json' });
            if (data) {
                return {
                    subscriptions: Array.isArray(data.subscriptions) ? data.subscriptions : [],
                    nodes: typeof data.nodes === 'string' ? data.nodes : ''
                };
            }
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
    // 返回初始数据
    return {
        subscriptions: initialData.subscriptions,
        nodes: initialData.nodes
    };
}

// 保存数据
async function saveData(subs, nds, env) {
    try {
        const data = {
            subscriptions: Array.isArray(subs) ? subs : [],
            nodes: typeof nds === 'string' ? nds : ''
        };
        // 检查 KV 是否存在，如果没有 KV 则返回成功（但不实际保存）
        if (env.SUB_KV) {
            await env.SUB_KV.put('data', JSON.stringify(data));
        }
        return true;
    } catch (error) {
        console.error('Error saving data:', error);
        return false;
    }
}

// 检查并解码 base64
function tryDecodeBase64(str) {
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    try {
        if (base64Regex.test(str)) {
            const decoded = atob(str);
            if (decoded.startsWith('vmess://') || 
                decoded.startsWith('vless://') || 
                decoded.startsWith('trojan://') ||
                decoded.startsWith('ss://') ||
                decoded.startsWith('ssr://') ||
                decoded.startsWith('snell://') ||
                decoded.startsWith('juicity://') ||
                decoded.startsWith('hysteria://') ||
                decoded.startsWith('hysteria2://') ||
                decoded.startsWith('tuic://') ||
                decoded.startsWith('anytls://') ||
                decoded.startsWith('wireguard://') ||
                decoded.startsWith('socks5://') ||
                decoded.startsWith('http://') ||
                decoded.startsWith('https://')) {
                return decoded;
            }
        }
        return str;
    } catch (error) {
        return str;
    }
}

// 移除特殊字符
function cleanNodeString(str) {
    return str
        .replace(/^["'`]+|["'`]+$/g, '')
        .replace(/,+$/g, '')
        .replace(/\s+/g, '')
        .trim();
}

// 获取订阅内容
async function fetchSubscriptionContent(subscription) {
    try {
        const response = await fetch(subscription, { 
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        if (!response.ok) {
            return null;
        }
        return await response.text();
    } catch (error) {
        console.error(`Error fetching subscription content: ${error}`);
        return null;
    }
}

// 解码 base64 内容
function decodeBase64Content(base64Content) {
    try {
        return atob(base64Content);
    } catch (error) {
        return base64Content;
    }
}

// 替换地址和端口
function replaceAddressAndPort(content, CFIP, CFPORT) {
    if (!CFIP || !CFPORT) {
        return content;
    }

    return content.split('\n').map(line => {
        line = line.trim();
        if (!line) return line;

        if (line.startsWith('vmess://')) {
            try {
                const base64Part = line.substring(8);
                const decoded = atob(base64Part);
                const nodeObj = JSON.parse(decoded);

                if ((nodeObj.net === 'ws' || nodeObj.net === 'xhttp') && nodeObj.tls === 'tls') {
                    if (!nodeObj.host || nodeObj.host !== nodeObj.add) {
                        nodeObj.add = CFIP;
                        nodeObj.port = parseInt(CFPORT, 10);
                    }
                    return 'vmess://' + btoa(JSON.stringify(nodeObj));
                }
            } catch (error) {
                console.error('Error processing VMess node:', error);
            }
        }
        else if (line.startsWith('vless://') || line.startsWith('trojan://')) {
            try {
                if ((line.includes('type=ws') || line.includes('type=xhttp')) && line.includes('security=tls')) {
                    const url = new URL(line);
                    const address = url.hostname;
                    const params = new URLSearchParams(url.search);
                    const host = params.get('host');

                    if (!host || host !== address) {
                        return line.replace(/@([\w.-]+):(\d+)/, `@${CFIP}:${CFPORT}`);
                    }
                }
            } catch (error) {
                console.error('Error processing VLESS/Trojan node:', error);
            }
        }

        return line;
    }).join('\n');
}

// 生成合并订阅
async function generateMergedSubscription(subscriptions, nodes, CFIP, CFPORT) {
    try {
        const promises = subscriptions.map(async (subscription) => {
            try {
                const subscriptionContent = await fetchSubscriptionContent(subscription);
                if (subscriptionContent) {
                    const decodedContent = decodeBase64Content(subscriptionContent);
                    const updatedContent = replaceAddressAndPort(decodedContent, CFIP, CFPORT);
                    return updatedContent;
                }
            } catch (error) {
                console.error(`Error fetching subscription content: ${error}`);
            }
            return null;
        });

        const mergedContentArray = await Promise.all(promises);
        const mergedContent = mergedContentArray.filter(content => content !== null).join('\n');

        const updatedNodes = replaceAddressAndPort(nodes, CFIP, CFPORT);
        return `${mergedContent}\n${updatedNodes}`;
    } catch (error) {
        console.error(`Error generating merged subscription: ${error}`);
        throw error;
    }
}

// 处理 CORS
function handleCors(request) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }
    
    return null;
}

// 主请求处理器
export default {
    async fetch(request, env, ctx) {
        // 检查 CORS 预检请求
        const corsResponse = handleCors(request);
        if (corsResponse) {
            return corsResponse;
        }

        const url = new URL(request.url);
        // 获取或生成 SUB_TOKEN
        let SUB_TOKEN = env.SUB_TOKEN;
        if (!SUB_TOKEN && env.SUB_KV) {
            try {
                SUB_TOKEN = await env.SUB_KV.get('SUB_TOKEN');
                if (!SUB_TOKEN) {
                    SUB_TOKEN = generateRandomString();
                    await env.SUB_KV.put('SUB_TOKEN', SUB_TOKEN);
                }
            } catch (error) {
                console.error('Error loading SUB_TOKEN from KV:', error);
                SUB_TOKEN = DEFAULT_SUB_TOKEN;
            }
        }
        if (!SUB_TOKEN) {
            SUB_TOKEN = DEFAULT_SUB_TOKEN;
        }
        
        const API_URL = env.API_URL || 'https://sublink.eooce.com';
        const CFIP = env.CFIP;
        const CFPORT = env.CFPORT;

        // JSON 响应辅助函数
        const jsonResponse = (data, status = 200) => {
            return new Response(JSON.stringify(data), {
                status,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        };

        // 静态文件服务 (仅支持简单的 HTML 文件)
        if (url.pathname === '/' || url.pathname === '/index.html') {
            const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Merge Subscription</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 20px; max-width: 1200px; margin: 0 auto; }
        h1 { color: #333; margin-bottom: 20px; }
        .container { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .section { background: #f5f5f5; padding: 20px; border-radius: 8px; }
        h2 { color: #555; margin-bottom: 15px; }
        textarea { width: 100%; height: 150px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; resize: vertical; }
        button { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px; }
        button:hover { background: #0056b3; }
        button.delete-btn { background: #dc3545; }
        button.delete-btn:hover { background: #c82333; }
        .data-display { margin-top: 20px; }
        .data-display pre { background: #fff; padding: 15px; border-radius: 4px; overflow-x: auto; }
        .auth-input { padding: 8px; margin-right: 10px; border: 1px solid #ddd; border-radius: 4px; }
        @media (max-width: 768px) { .container { grid-template-columns: 1fr; } }
    </style>
</head>
<body>
    <h1>Merge Subscription - Cloudflare Worker</h1>
    
    <div id="authPrompt" style="margin-bottom: 20px; display: none;">
        <input type="text" id="authUsername" class="auth-input" placeholder="用户名">
        <input type="password" id="authPassword" class="auth-input" placeholder="密码">
        <button onclick="saveAuth()">确认</button>
    </div>
    
    <div id="content">
        <div class="container">
            <div class="section">
                <h2>添加订阅或节点</h2>
                <textarea id="addInput" placeholder="每行一个订阅链接或节点（支持 base64）"></textarea>
                <div>
                    <button onclick="addItem()">添加</button>
                </div>
            </div>
            
            <div class="section">
                <h2>删除订阅或节点</h2>
                <textarea id="deleteInput" placeholder="每行一个要删除的订阅链接或节点"></textarea>
                <div>
                    <button onclick="deleteItem()" class="delete-btn">删除</button>
                </div>
            </div>
        </div>
        
        <div class="section data-display">
            <h2>当前数据</h2>
            <button onclick="loadData()">刷新数据</button>
            <pre id="dataDisplay"></pre>
        </div>
        
        <div class="section">
            <h2>订阅链接</h2>
            <button onclick="showSubscriptionInfo()">查看订阅链接</button>
        </div>
    </div>

    <script>
        let authCredentials = '';
        
        function getAuthHeader() {
            return 'Basic ' + authCredentials;
        }
        
        // 统一的带认证的 fetch 函数
        async function fetchWithAuth(url, options = {}) {
            const headers = options.headers || {};
            // 只有当有凭证时才添加 Authorization header
            if (authCredentials) {
                headers['Authorization'] = getAuthHeader();
            }
            options.headers = headers;
            
            const response = await fetch(url, options);
            
            // 如果返回 401，显示认证提示框
            if (response.status === 401) {
                document.getElementById('authPrompt').style.display = 'block';
                throw new Error('需要认证');
            }
            
            return response;
        }
        
        function saveAuth() {
            const username = document.getElementById('authUsername').value;
            const password = document.getElementById('authPassword').value;
            if (username && password) {
                authCredentials = btoa(username + ':' + password);
                document.getElementById('authPrompt').style.display = 'none';
                loadData();
            }
        }
        
        async function loadData() {
            try {
                const response = await fetchWithAuth('/admin/data');
                
                if (!response.ok) {
                    alert('认证失败');
                    document.getElementById('authPrompt').style.display = 'block';
                    return;
                }
                
                const data = await response.json();
                document.getElementById('dataDisplay').textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                if (error.message !== '需要认证') {
                    console.error('加载数据失败:', error);
                }
            }
        }
        
        // 页面加载时尝试加载数据，自动触发认证
        window.addEventListener('load', loadData);
        
        // 判断是订阅还是节点
        function isSubscription(input) {
            const lines = input.split('\\n').map(line => line.trim()).filter(line => line);
            if (lines.length === 0) return false;
            // 如果所有行都是 URL，则认为是订阅
            return lines.every(line => line.startsWith('http://') || line.startsWith('https://'));
        }
        
        async function addItem() {
            const input = document.getElementById('addInput').value.trim();
            if (!input) {
                alert('请输入订阅链接或节点');
                return;
            }

            const isSub = isSubscription(input);
            const endpoint = isSub ? '/admin/add-subscription' : '/admin/add-node';
            const body = isSub ? { subscription: input } : { node: input };

            try {
                const response = await fetchWithAuth(endpoint, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
                const result = await response.json();
                alert(result.message || result.error);
                document.getElementById('addInput').value = '';
                loadData();
            } catch (error) {
                if (error.message !== '需要认证') {
                    alert('添加失败: ' + error.message);
                }
            }
        }
        
        async function deleteItem() {
            const input = document.getElementById('deleteInput').value.trim();
            if (!input) {
                alert('请输入要删除的订阅链接或节点');
                return;
            }

            const isSub = isSubscription(input);
            const endpoint = isSub ? '/admin/delete-subscription' : '/admin/delete-node';
            const body = isSub ? { subscription: input } : { node: input };

            try {
                const response = await fetchWithAuth(endpoint, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
                const result = await response.json();
                alert(result.message || result.error);
                document.getElementById('deleteInput').value = '';
                loadData();
            } catch (error) {
                if (error.message !== '需要认证') {
                    alert('删除失败: ' + error.message);
                }
            }
        }
        
        async function showSubscriptionInfo() {
            try {
                const [tokenResponse, apiUrlResponse] = await Promise.all([
                    fetch('/get-sub-token'),
                    fetch('/get-apiurl')
                ]);
                
                if (!tokenResponse.ok) {
                    alert('获取订阅令牌失败');
                    return;
                }
                
                const tokenData = await tokenResponse.json();
                const subToken = tokenData.token;
                
                const apiUrlData = await apiUrlResponse.json();
                const apiUrl = apiUrlData.ApiUrl || 'https://sublink.eooce.com';
                
                const currentDomain = window.location.origin;
                
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000;';
                
                const alertBox = document.createElement('div');
                alertBox.style.cssText = 'background: white; padding: 20px; border-radius: 8px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;';
                
                const lines = [];
                lines.push('<h3 style="margin-bottom: 15px;">订阅链接</h3>');
                lines.push('<div style="margin-bottom: 10px;"><strong>默认订阅链接(base64)：</strong><br><input type="text" value="' + currentDomain + '/' + subToken + '" style="width: 100%; padding: 5px; margin-top: 5px;" readonly onclick="this.select()"></div>');
                lines.push('<div style="margin-bottom: 10px;"><strong>带优选IP订阅链接(base64)：</strong><br><input type="text" value="' + currentDomain + '/' + subToken + '?CFIP=time.is&CFPORT=443" style="width: 100%; padding: 5px; margin-top: 5px;" readonly onclick="this.select()"></div>');
                lines.push('<div style="margin-bottom: 10px;"><strong>clash订阅(FIclash/Mihomo/ClashMeta)：</strong><br><input type="text" value="' + apiUrl + '/clash?config=' + currentDomain + '/' + subToken + '" style="width: 100%; padding: 5px; margin-top: 5px;" readonly onclick="this.select()"></div>');
                lines.push('<div style="margin-bottom: 10px;"><strong>sing-box订阅：</strong><br><input type="text" value="' + apiUrl + '/singbox?config=' + currentDomain + '/' + subToken + '" style="width: 100%; padding: 5px; margin-top: 5px;" readonly onclick="this.select()"></div>');
                lines.push('<div style="margin-top: 15px; font-size: 12px; color: #666;">提醒：将time.is和443改为更快的优选ip或优选域名和对应的端口。</div>');
                lines.push('<button onclick="this.closest(\\'div[style*="position: fixed"]\\').remove()" style="margin-top: 15px; padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">关闭</button>');
                
                alertBox.innerHTML = lines.join('');
                overlay.appendChild(alertBox);
                document.body.appendChild(overlay);
                
                overlay.onclick = function(e) {
                    if (e.target === overlay) {
                        overlay.remove();
                    }
                };
            } catch (error) {
                console.error('Error:', error);
                alert('获取订阅信息失败');
            }
        }
    </script>
</body>
</html>`;
            return new Response(html, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }

        // 获取 SUB_TOKEN
        if (url.pathname === '/get-sub-token') {
            return jsonResponse({ token: SUB_TOKEN });
        }

        // 获取 API_URL
        if (url.pathname === '/get-apiurl') {
            return jsonResponse({ ApiUrl: API_URL });
        }

        // 订阅路由
        if (url.pathname === `/${SUB_TOKEN}`) {
            try {
                const queryCFIP = url.searchParams.get('CFIP');
                const queryCFPORT = url.searchParams.get('CFPORT');

                const finalCFIP = queryCFIP || CFIP;
                const finalCFPORT = queryCFPORT || CFPORT;

                const data = await loadData(env);
                const mergedSubscription = await generateMergedSubscription(
                    data.subscriptions,
                    data.nodes,
                    finalCFIP,
                    finalCFPORT
                );
                const base64Content = btoa(mergedSubscription);
                return new Response(base64Content, {
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            } catch (error) {
                console.error(`Error handling /${SUB_TOKEN} route: ${error}`);
                return new Response('Internal Server Error', { status: 500 });
            }
        }

        // 获取数据
        if (url.pathname === '/admin/data' && request.method === 'GET') {
            const isAuthenticated = await verifyAuth(request, env);
            if (!isAuthenticated) {
                return new Response('认证失败', { 
                    status: 401,
                    headers: { 'WWW-Authenticate': 'Basic realm="Node"' }
                });
            }

            const data = await loadData(env);
            const nodesList = typeof data.nodes === 'string'
                ? data.nodes.split('\n').map(n => n.trim()).filter(n => n)
                : [];

            return jsonResponse({
                subscriptions: data.subscriptions,
                nodes: nodesList
            });
        }

        // 添加订阅
        if (url.pathname === '/admin/add-subscription' && request.method === 'POST') {
            const isAuthenticated = await verifyAuth(request, env);
            if (!isAuthenticated) {
                return new Response('认证失败', { 
                    status: 401,
                    headers: { 'WWW-Authenticate': 'Basic realm="Node"' }
                });
            }

            try {
                const body = await request.json();
                const newSubscriptionInput = body.subscription?.trim();

                if (!newSubscriptionInput) {
                    return jsonResponse({ error: 'Subscription URL is required' }, 400);
                }

                const data = await loadData(env);
                let subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];

                const newSubscriptions = newSubscriptionInput.split('\n')
                    .map(sub => sub.trim())
                    .filter(sub => sub);

                const addedSubs = [];
                const existingSubs = [];

                for (const sub of newSubscriptions) {
                    if (subscriptions.some(existingSub => existingSub.trim() === sub)) {
                        existingSubs.push(sub);
                    } else {
                        addedSubs.push(sub);
                        subscriptions.push(sub);
                    }
                }

                if (addedSubs.length > 0) {
                    await saveData(subscriptions, data.nodes, env);
                    const message = addedSubs.length === newSubscriptions.length 
                        ? '订阅添加成功' 
                        : `成功添加 ${addedSubs.length} 个订阅，${existingSubs.length} 个订阅已存在`;
                    return jsonResponse({ message });
                } else {
                    return jsonResponse({ error: '所有订阅已存在' }, 400);
                }
            } catch (error) {
                console.error('Error adding subscription:', error);
                return jsonResponse({ error: 'Failed to add subscription' }, 500);
            }
        }

        // 删除订阅
        if (url.pathname === '/admin/delete-subscription' && request.method === 'POST') {
            const isAuthenticated = await verifyAuth(request, env);
            if (!isAuthenticated) {
                return new Response('认证失败', { 
                    status: 401,
                    headers: { 'WWW-Authenticate': 'Basic realm="Node"' }
                });
            }

            try {
                const body = await request.json();
                const subsToDelete = body.subscription?.trim();

                if (!subsToDelete) {
                    return jsonResponse({ error: 'Subscription URL is required' }, 400);
                }

                const data = await loadData(env);
                let subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];

                const deleteList = subsToDelete.split('\n')
                    .map(sub => sub.trim())
                    .filter(sub => sub);

                const deletedSubs = [];
                const notFoundSubs = [];

                deleteList.forEach(subToDelete => {
                    const index = subscriptions.findIndex(sub => 
                        sub.trim() === subToDelete.trim()
                    );
                    if (index !== -1) {
                        deletedSubs.push(subToDelete);
                        subscriptions.splice(index, 1);
                    } else {
                        notFoundSubs.push(subToDelete);
                    }
                });

                if (deletedSubs.length > 0) {
                    await saveData(subscriptions, data.nodes, env);
                    const message = deletedSubs.length === deleteList.length 
                        ? '订阅删除成功' 
                        : `成功删除 ${deletedSubs.length} 个订阅，${notFoundSubs.length} 个订阅不存在`;
                    return jsonResponse({ message });
                } else {
                    return jsonResponse({ error: '未找到要删除的订阅' }, 404);
                }
            } catch (error) {
                console.error('Error deleting subscription:', error);
                return jsonResponse({ error: 'Failed to delete subscription' }, 500);
            }
        }

        // 添加节点
        if (url.pathname === '/admin/add-node' && request.method === 'POST') {
            const isAuthenticated = await verifyAuth(request, env);
            if (!isAuthenticated) {
                return new Response('认证失败', { 
                    status: 401,
                    headers: { 'WWW-Authenticate': 'Basic realm="Node"' }
                });
            }

            try {
                const body = await request.json();
                const newNode = body.node?.trim();

                if (!newNode) {
                    return jsonResponse({ error: 'Node is required' }, 400);
                }

                const data = await loadData(env);
                let nodesList = typeof data.nodes === 'string'
                    ? data.nodes.split('\n').map(n => n.trim()).filter(n => n)
                    : [];

                const newNodes = newNode.split('\n')
                    .map(n => n.trim())
                    .filter(n => n)
                    .map(n => tryDecodeBase64(n));

                const addedNodes = [];
                const existingNodes = [];

                for (const node of newNodes) {
                    if (nodesList.some(existingNode => existingNode === node)) {
                        existingNodes.push(node);
                    } else {
                        addedNodes.push(node);
                        nodesList.push(node);
                    }
                }

                if (addedNodes.length > 0) {
                    const updatedNodes = nodesList.join('\n');
                    await saveData(data.subscriptions, updatedNodes, env);
                    const message = addedNodes.length === newNodes.length 
                        ? '节点添加成功' 
                        : `成功添加 ${addedNodes.length} 个节点，${existingNodes.length} 个节点已存在`;
                    return jsonResponse({ message });
                } else {
                    return jsonResponse({ error: '所有节点已存在' }, 400);
                }
            } catch (error) {
                console.error('Error adding node:', error);
                return jsonResponse({ error: 'Failed to add node' }, 500);
            }
        }

        // 删除节点
        if (url.pathname === '/admin/delete-node' && request.method === 'POST') {
            const isAuthenticated = await verifyAuth(request, env);
            if (!isAuthenticated) {
                return new Response('认证失败', { 
                    status: 401,
                    headers: { 'WWW-Authenticate': 'Basic realm="Node"' }
                });
            }

            try {
                const body = await request.json();
                const nodesToDelete = body.node?.trim();

                if (!nodesToDelete) {
                    return jsonResponse({ error: 'Node is required' }, 400);
                }

                const deleteList = nodesToDelete.split('\n')
                    .map(node => cleanNodeString(node))
                    .filter(node => node);

                const data = await loadData(env);
                let nodesList = data.nodes.split('\n')
                    .map(node => cleanNodeString(node))
                    .filter(node => node);

                const deletedNodes = [];
                const notFoundNodes = [];

                deleteList.forEach(nodeToDelete => {
                    const index = nodesList.findIndex(node => 
                        cleanNodeString(node) === cleanNodeString(nodeToDelete)
                    );
                    
                    if (index !== -1) {
                        deletedNodes.push(nodeToDelete);
                        nodesList.splice(index, 1);
                    } else {
                        notFoundNodes.push(nodeToDelete);
                    }
                });

                if (deletedNodes.length > 0) {
                    const updatedNodes = nodesList.join('\n');
                    await saveData(data.subscriptions, updatedNodes, env);
                    const message = deletedNodes.length === deleteList.length 
                        ? '节点删除成功' 
                        : `成功删除 ${deletedNodes.length} 个节点，${notFoundNodes.length} 个节点不存在`;
                    return jsonResponse({ message });
                } else {
                    return jsonResponse({ error: '未找到要删除的节点' }, 404);
                }
            } catch (error) {
                console.error('Error deleting node:', error);
                return jsonResponse({ error: 'Failed to delete node' }, 500);
            }
        }

        // 更新凭证
        // API 路由 - 添加订阅（无需验证）
        if (url.pathname === '/api/add-subscriptions' && request.method === 'POST') {
            try {
                const body = await request.json();
                const newSubscriptions = body.subscription;

                if (!newSubscriptions) {
                    return jsonResponse({ error: 'Subscription URL is required' }, 400);
                }

                const data = await loadData(env);
                let subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];

                const processedSubs = Array.isArray(newSubscriptions)
                    ? newSubscriptions.map(sub => sub.trim()).filter(sub => sub)
                    : [newSubscriptions.trim()].filter(sub => sub);

                const addedSubs = [];
                const existingSubs = [];

                for (const sub of processedSubs) {
                    if (subscriptions.some(existingSub => existingSub.trim() === sub)) {
                        existingSubs.push(sub);
                    } else {
                        addedSubs.push(sub);
                        subscriptions.push(sub);
                    }
                }

                if (addedSubs.length > 0) {
                    await saveData(subscriptions, data.nodes, env);
                    return jsonResponse({
                        success: true,
                        added: addedSubs,
                        existing: existingSubs
                    });
                } else {
                    return jsonResponse({
                        success: false,
                        error: 'All subscriptions already exist'
                    }, 400);
                }
            } catch (error) {
                console.error('API Error adding subscription:', error);
                return jsonResponse({ error: 'Failed to add subscription' }, 500);
            }
        }

        // API 路由 - 添加节点（无需验证）
        if (url.pathname === '/api/add-nodes' && request.method === 'POST') {
            try {
                const body = await request.json();
                const newNodes = body.nodes;

                if (!newNodes) {
                    return jsonResponse({ error: 'Nodes are required' }, 400);
                }

                const data = await loadData(env);
                let nodesList = typeof data.nodes === 'string'
                    ? data.nodes.split('\n').map(n => n.trim()).filter(n => n)
                    : [];

                const processedNodes = Array.isArray(newNodes)
                    ? newNodes
                    : newNodes.split('\n');

                const nodesToAdd = processedNodes
                    .map(n => n.trim())
                    .filter(n => n)
                    .map(n => tryDecodeBase64(n));

                const addedNodes = [];
                const existingNodes = [];

                for (const node of nodesToAdd) {
                    if (nodesList.some(existingNode => existingNode === node)) {
                        existingNodes.push(node);
                    } else {
                        addedNodes.push(node);
                        nodesList.push(node);
                    }
                }

                if (addedNodes.length > 0) {
                    const updatedNodes = nodesList.join('\n');
                    await saveData(data.subscriptions, updatedNodes, env);
                    return jsonResponse({
                        success: true,
                        added: addedNodes,
                        existing: existingNodes
                    });
                } else {
                    return jsonResponse({
                        success: false,
                        error: 'All nodes already exist'
                    }, 400);
                }
            } catch (error) {
                console.error('API Error adding nodes:', error);
                return jsonResponse({ error: 'Failed to add nodes' }, 500);
            }
        }

        // API 路由 - 删除订阅（无需验证）
        if (url.pathname === '/api/delete-subscriptions' && request.method === 'DELETE') {
            try {
                const body = await request.json();
                const subsToDelete = body.subscription;

                if (!subsToDelete) {
                    return jsonResponse({ error: 'Subscription URL is required' }, 400);
                }

                const data = await loadData(env);
                let subscriptions = Array.isArray(data.subscriptions) ? data.subscriptions : [];

                const deleteList = Array.isArray(subsToDelete) 
                    ? subsToDelete 
                    : subsToDelete.split('\n');

                const processedSubs = deleteList
                    .map(sub => cleanNodeString(sub))
                    .filter(sub => sub);

                const deletedSubs = [];
                const notFoundSubs = [];

                processedSubs.forEach(subToDelete => {
                    const index = subscriptions.findIndex(sub => 
                        cleanNodeString(sub) === subToDelete
                    );
                    if (index !== -1) {
                        deletedSubs.push(subToDelete);
                        subscriptions.splice(index, 1);
                    } else {
                        notFoundSubs.push(subToDelete);
                    }
                });

                if (deletedSubs.length > 0) {
                    await saveData(subscriptions, data.nodes, env);
                    return jsonResponse({
                        success: true,
                        deleted: deletedSubs,
                        notFound: notFoundSubs
                    });
                } else {
                    return jsonResponse({
                        success: false,
                        error: 'No subscriptions found to delete'
                    }, 404);
                }
            } catch (error) {
                console.error('API Error deleting subscription:', error);
                return jsonResponse({ error: 'Failed to delete subscription' }, 500);
            }
        }

        // API 路由 - 删除节点（无需验证）
        if (url.pathname === '/api/delete-nodes' && request.method === 'DELETE') {
            try {
                const body = await request.json();
                const nodesToDelete = body.nodes;

                if (!nodesToDelete) {
                    return jsonResponse({ error: 'Nodes are required' }, 400);
                }

                const deleteList = Array.isArray(nodesToDelete)
                    ? nodesToDelete
                    : nodesToDelete.split('\n');

                const processedNodes = deleteList
                    .map(node => cleanNodeString(node))
                    .filter(node => node);

                const data = await loadData(env);
                let nodesList = data.nodes.split('\n')
                    .map(node => cleanNodeString(node))
                    .filter(node => node);

                const deletedNodes = [];
                const notFoundNodes = [];

                processedNodes.forEach(nodeToDelete => {
                    const index = nodesList.findIndex(node => 
                        cleanNodeString(node) === cleanNodeString(nodeToDelete)
                    );
                    
                    if (index !== -1) {
                        deletedNodes.push(nodeToDelete);
                        nodesList.splice(index, 1);
                    } else {
                        notFoundNodes.push(nodeToDelete);
                    }
                });

                if (deletedNodes.length > 0) {
                    const updatedNodes = nodesList.join('\n');
                    await saveData(data.subscriptions, updatedNodes, env);
                    return jsonResponse({
                        success: true,
                        deleted: deletedNodes,
                        notFound: notFoundNodes
                    });
                } else {
                    return jsonResponse({
                        success: false,
                        error: 'No nodes found to delete'
                    }, 404);
                }
            } catch (error) {
                console.error('API Error deleting nodes:', error);
                return jsonResponse({ error: 'Failed to delete nodes' }, 500);
            }
        }

        // 404 响应
        return new Response('Not Found', { status: 404 });
    }
};