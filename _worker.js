export default {
  async fetch(request, env) {
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

    const url = new URL(request.url);
    const originalPath = url.pathname;
    
    // 将 OpenAI 格式的路径转换为 Anthropic 格式
    if (originalPath.startsWith('/v1/chat/completions')) {
      // OpenAI chat completions -> Anthropic messages
      url.pathname = '/v1/messages';
      url.host = 'api.anthropic.com';
      
      // 读取请求体
      const requestBody = await request.json();
      
      // 转换请求格式
      const anthropicBody = {
        model: requestBody.model,
        max_tokens: requestBody.max_tokens || 1000,
        temperature: requestBody.temperature || 0.7,
        messages: requestBody.messages
      };
      
      // 创建新的请求头
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      headers.set('anthropic-version', '2023-06-01');
      
      // 从原始请求头中获取 API key
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const apiKey = authHeader.substring(7); // 移除 'Bearer ' 前缀
        headers.set('x-api-key', apiKey);
      }
      
      // 发送请求到 Anthropic
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(anthropicBody)
      });
      
      const anthropicResponse = await response.json();
      
      // 转换响应格式为 OpenAI 兼容格式
      let openaiResponse;
      if (response.ok) {
        openaiResponse = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: requestBody.model,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: anthropicResponse.content[0].text
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: anthropicResponse.usage?.input_tokens || 0,
            completion_tokens: anthropicResponse.usage?.output_tokens || 0,
            total_tokens: (anthropicResponse.usage?.input_tokens || 0) + (anthropicResponse.usage?.output_tokens || 0)
          }
        };
      } else {
        openaiResponse = anthropicResponse;
      }
      
      return new Response(JSON.stringify(openaiResponse), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
        }
      });
    }
    
    // 其他路径直接转发
    url.host = 'api.anthropic.com';
    return fetch(url, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
  }
}
