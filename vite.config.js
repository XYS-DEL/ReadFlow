import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import { ProxyAgent } from 'undici'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-cors-proxy',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api/proxy')) {
            let targetUrl = '';
            try {
              const urlObj = new URL(req.url, 'http://localhost');
              targetUrl = urlObj.searchParams.get('url');
              
              if (!targetUrl) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.end('Missing url parameter');
                return;
              }

              // 记录请求日志
              fs.appendFileSync('proxy_requests.log', `${new Date().toISOString()} - 请求抓取: ${targetUrl}\n`);

              // 【智能双路分流代理调度系统】
              // 1. 判断是否为海外域名 (如 GitHub 等)
              const isForeign = /github\.com|google\.com|wikipedia\.org|raw\.githubusercontent\.com/i.test(targetUrl);
              
              let dispatcher = undefined;
              if (isForeign) {
                // 2. 如果是海外域名，依次尝试：系统环境代理 -> 默认 Clash 本地代理 (http://127.0.0.1:7890)
                const proxyUrl = process.env.https_proxy || 
                                 process.env.HTTPS_PROXY || 
                                 process.env.http_proxy || 
                                 process.env.HTTP_PROXY || 
                                 'http://127.0.0.1:7890';
                
                try {
                  dispatcher = new ProxyAgent(proxyUrl);
                  fs.appendFileSync('proxy_requests.log', `[代理分流] 判定为海外域名，使用代理节点: ${proxyUrl}\n`);
                } catch (e) {
                  fs.appendFileSync('proxy_error.log', `[代理警告] 代理构建失败，退回到直连模式: ${e.message}\n`);
                }
              } else {
                // 3. 如果是国内域名 (如微信、Gitee、掘金、新浪、CSDN)，完全不走代理，走本地网络直接抓取，速度极快！
                fs.appendFileSync('proxy_requests.log', `[代理分流] 判定为国内域名，启用极速直连模式\n`);
              }

              // 实例化本地 Node 超时断开器，限制 8 秒超时，防代理挂死
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 8000);

              let response;
              const requestHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
              };

              try {
                // 【核心：自愈式网络获取】1. 尝试使用代理分流获取网页
                response = await fetch(targetUrl, {
                  signal: controller.signal,
                  dispatcher: dispatcher, // 注入智能调度器
                  headers: requestHeaders
                });
              } catch (fetchErr) {
                // 2. 如果代理握手失败 (比如用户没开 VPN，或者 Clash 端口不是 7890 拒绝连接)
                // 我们瞬间启动自愈机制，自动切换到本地网络“极速直连”，彻底防止因代理配错引发的死锁！
                fs.appendFileSync('proxy_error.log', `${new Date().toISOString()} - [代理故障自愈] 无法连接到代理服务器，自动切回本地直连模式。错误: ${fetchErr.message}\n`);
                
                response = await fetch(targetUrl, {
                  signal: controller.signal,
                  headers: requestHeaders
                });
              }

              clearTimeout(timeoutId);

              if (!response.ok) {
                const errMsg = `目标服务器返回状态码: ${response.status}`;
                fs.appendFileSync('proxy_error.log', `${new Date().toISOString()} - URL: ${targetUrl} - Error: ${errMsg}\n`);
                res.statusCode = response.status;
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.end(errMsg);
                return;
              }

              const html = await response.text();
              
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(html);
            } catch (err) {
              // 捕获所有代理错误并写入日志，供诊断使用
              fs.appendFileSync('proxy_error.log', `${new Date().toISOString()} - URL: ${targetUrl} - Error: ${err.message}\nStack: ${err.stack}\n\n`);
              
              res.statusCode = 500;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end(`本地代理报错: ${err.message}`);
            }
            return;
          }
          next();
        });
      }
    }
  ],
})
