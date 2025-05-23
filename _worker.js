export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    url.host = "api.anthropic.com";
    
    // 创建新的请求头
    const headers = new Headers(request.headers);
    
    // 添加必要的 CORS 头（如果需要）
    const response = await fetch(url, {
      headers: headers,
      method: request.method,
      body: request.body,
      redirect: 'follow'
    });
    
    // 创建新的响应，添加 CORS 头
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
    
    // 添加 CORS 头以支持跨域请求
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');
    
    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
          'Access-Control-Max-Age': '86400',
        }
      });
    }
    
    return newResponse;
  }
}
