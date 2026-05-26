// test_fetch.js
// 诊断本地 Node.js 能否正常抓取微信公众号网址
const targetUrl = 'https://mp.weixin.qq.com/s/ezeKeUvUDVrMC7kMjZK0Fw'; 

console.log('正在用 Node.js', process.version, '请求:', targetUrl);

fetch(targetUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
  }
})
.then(res => {
  console.log('请求成功！响应状态码:', res.status);
  return res.text();
})
.then(text => {
  console.log('获取到的 HTML 长度:', text.length);
  if (text.length > 500) {
    console.log('内容片段:', text.slice(0, 1000));
  } else {
    console.log('内容太短，可能被拦截了，返回正文:', text);
  }
})
.catch(err => {
  console.error('请求失败！错误原因:', err);
});
