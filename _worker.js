export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version',
    };

    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders
      });
    }

    try {
      const url = new URL(request.url);
      const originalPath = url.pathname;
      
      // 处理根路径访问
      if (originalPath === '/' || originalPath === '') {
        return new Response(JSON.stringify({
          status: 'Anthropic API Proxy is running',
          timestamp: new Date().toISOString(),
          endpoints: [
            'POST /v1/chat/completions - OpenAI compatible endpoint',
            'POST /v1/messages - Anthropic native endpoint',
            'GET /v1/models - List available models'
          ]
        }), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // 处理 Anthropic 原生 /v1/messages 端点
      if (originalPath.includes('/v1/messages')) {
        if (request.method !== 'POST') {
          return new Response(JSON.stringify({
            error: { message: 'Method not allowed. Use POST.' }
          }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // 直接转发到 Anthropic API
        const newUrl = new URL(request.url);
        newUrl.host = 'api.anthropic.com';
        
        // 复制所有请求头
        const headers = new Headers(request.headers);
        
        const response = await fetch(newUrl, {
          method: request.method,
          headers: headers,
          body: request.body
        });
        
        const responseData = await response.text();
        
        return new Response(responseData, {
          status: response.status,
          headers: {
            'Content-Type': response.headers.get('Content-Type') || 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // 处理 models 端点
      if (originalPath.includes('/models')) {
        const modelsResponse = {
          object: "list",
          data: [
            {
              id: "claude-3-sonnet-20240229",
              object: "model",
              created: 1677610602,
              owned_by: "anthropic"
            },
            {
              id: "claude-3-haiku-20240307",
              object: "model", 
              created: 1677610602,
              owned_by: "anthropic"
            },
            {
              id: "claude-3-opus-20240229",
              object: "model",
              created: 1677610602,
              owned_by: "anthropic"
            }
          ]
        };
        
        return new Response(JSON.stringify(modelsResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      // 处理 OpenAI 兼容的 chat completions 请求
      if (originalPath.includes('/chat/completions')) {
        
        if (request.method !== 'POST') {
          return new Response(JSON.stringify({
            error: { message: 'Method not allowed. Use POST.' }
          }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        let requestBody;
        try {
          requestBody = await request.json();
        } catch (e) {
          return new Response(JSON.stringify({
            error: { message: 'Invalid JSON in request body' }
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response(JSON.stringify({
            error: { message: 'Missing or invalid Authorization header' }
          }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const apiKey = authHeader.substring(7);
        
        // 构建 Anthropic API 请求
        const anthropicBody = {
          model: requestBody.model,
          max_tokens: requestBody.max_tokens || 1000,
          messages: requestBody.messages
        };
        
        if (requestBody.temperature !== undefined) {
          anthropicBody.temperature = requestBody.temperature;
        }
        if (requestBody.top_p !== undefined) {
          anthropicBody.top_p = requestBody.top_p;
        }
        
        const anthropicHeaders = {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        };
        
        const anthropicUrl = 'https://api.anthropic.com/v1/messages';
        
        try {
          const response = await fetch(anthropicUrl, {
            method: 'POST',
            headers: anthropicHeaders,
            body: JSON.stringify(anthropicBody)
          });
          
          const anthropicResponse = await response.json();
          
          if (response.ok && anthropicResponse.content) {
            const openaiResponse = {
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
                finish_reason: anthropicResponse.stop_reason === 'end_turn' ? 'stop' : anthropicResponse.stop_reason
              }],
              usage: {
                prompt_tokens: anthropicResponse.usage?.input_tokens || 0,
                completion_tokens: anthropicResponse.usage?.output_tokens || 0,
                total_tokens: (anthropicResponse.usage?.input_tokens || 0) + (anthropicResponse.usage?.output_tokens || 0)
              }
            };
            
            return new Response(JSON.stringify(openaiResponse), {
              status: 200,
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          } else {
            return new Response(JSON.stringify(anthropicResponse), {
              status: response.status,
              headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
          }
          
        } catch (fetchError) {
          return new Response(JSON.stringify({
            error: { 
              message: 'Failed to connect to Anthropic API',
              details: fetchError.message
            }
          }), {
            status: 502,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
      }
      
      // 其他请求直接转发到 Anthropic
      const newUrl = new URL(request.url);
      newUrl.host = 'api.anthropic.com';
      
      return fetch(newUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      
    } catch (error) {
      return new Response(JSON.stringify({
        error: { 
          message: 'Internal server error',
          details: error.message
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }
}
