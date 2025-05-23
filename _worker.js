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
      
      // 处理根路径访问 - 返回状态信息
      if (originalPath === '/' || originalPath === '') {
        return new Response(JSON.stringify({
          status: 'Anthropic API Proxy is running',
          timestamp: new Date().toISOString(),
          endpoints: [
            'POST /v1/chat/completions - OpenAI compatible endpoint'
          ]
        }), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // 处理 OpenAI 兼容的 chat completions 请求
      if (originalPath.includes('/chat/completions')) {
        
        // 验证请求方法
        if (request.method !== 'POST') {
          return new Response(JSON.stringify({
            error: { message: 'Method not allowed. Use POST.' }
          }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // 读取和验证请求体
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
        
        // 验证必需的字段
        if (!requestBody.model) {
          return new Response(JSON.stringify({
            error: { message: 'Missing required field: model' }
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        if (!requestBody.messages || !Array.isArray(requestBody.messages)) {
          return new Response(JSON.stringify({
            error: { message: 'Missing or invalid messages field' }
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // 验证认证
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
        
        // 添加可选参数
        if (requestBody.temperature !== undefined) {
          anthropicBody.temperature = requestBody.temperature;
        }
        if (requestBody.top_p !== undefined) {
          anthropicBody.top_p = requestBody.top_p;
        }
        if (requestBody.stop !== undefined) {
          anthropicBody.stop_sequences = Array.isArray(requestBody.stop) ? requestBody.stop : [requestBody.stop];
        }
        
        // 设置 Anthropic API 请求头
        const anthropicHeaders = {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        };
        
        // 发送请求到 Anthropic API
        const anthropicUrl = 'https://api.anthropic.com/v1/messages';
        
        try {
          const response = await fetch(anthropicUrl, {
            method: 'POST',
            headers: anthropicHeaders,
            body: JSON.stringify(anthropicBody)
          });
          
          const anthropicResponse = await response.json();
          
          // 转换响应格式
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
            // 返回 Anthropic 的错误响应
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
      
      // 未知路径
      return new Response(JSON.stringify({
        error: { message: `Unknown endpoint: ${originalPath}` }
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
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
