from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import os
import json
from llm_client import LLMClient

app = Flask(__name__)
# 配置CORS
CORS(app, resources={
    r"/*": {
        "origins": ["https://zh.semrush.com"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "expose_headers": ["Content-Type"],
        "supports_credentials": True,
        "max_age": 3600
    }
})

# 缓存文件路径
CACHE_FILE = 'domain_cache.json'

# 初始化LLM客户端
llm_client = LLMClient()

# 存储正在处理的域名结果
processing_results = {}

def load_cache_data():
    """从缓存文件加载域名解释数据"""
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                print("Load cache data success")
                return json.load(f)
        except Exception as e:
            print(f"读取缓存数据文件出错: {str(e)}")
    return {}

def save_cache_data(data):
    """保存域名解释数据到缓存文件"""
    return
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
            print("Save cache data success")
    except Exception as e:
        print(f"保存缓存数据文件出错: {str(e)}")

@app.route('/explain-domains', methods=['POST'])
def explain_domains():
    # 在生成器外部获取请求数据
    request_data = request.get_json()
    domains = request_data.get('domains', [])
    
    def generate():
        if not domains:
            yield json.dumps({'error': '没有提供域名'})
            return
            
        explanations = {}
        cache_data = load_cache_data()
        tbd_domains = []
        
        # 检查缓存中是否存在
        for domain in domains:
            if domain in cache_data:
                explanations[domain] = cache_data[domain]
                # 立即返回缓存结果并存储到处理结果中
                result = {domain: cache_data[domain]}
                processing_results.update(result)
                yield json.dumps(result) + '\n'
            else:
                tbd_domains.append(domain)
        
        # 如果有未缓存的域名，调用API获取解释
        if tbd_domains:
            try:
                # 使用流式调用，每得到一个结果就返回
                for domain, explanation in llm_client.get_domain_explanations_stream_iter(tbd_domains):
                    if domain and explanation:
                        # 更新缓存
                        cache_data[domain] = explanation
                        save_cache_data(cache_data)
                        # 存储到处理结果中
                        result = {domain: explanation}
                        processing_results.update(result)
                        # 返回单个结果
                        yield json.dumps(result) + '\n'
            except Exception as e:
                print(f"处理域名解释时出错: {str(e)}")
                # 如果出错，对未解释的域名返回默认值
                for domain in tbd_domains:
                    if domain not in explanations:
                        result = {domain: "无法获取域名解释"}
                        processing_results.update(result)
                        yield json.dumps(result) + '\n'
    
    return Response(generate(), mimetype='application/x-ndjson')

@app.route('/get-results', methods=['POST'])
def get_results():
    """获取正在处理中的域名结果"""
    data = request.json
    domains = data.get('domains', [])
    
    if not domains:
        return jsonify({}), 400
        
    results = {}
    for domain in domains:
        if domain in processing_results:
            results[domain] = processing_results[domain]
            # 从处理中列表移除已返回的结果
            del processing_results[domain]
            
    return jsonify(results)

if __name__ == '__main__':
    app.run(debug=True, port=5001)


'''
curl -X POST http://localhost:5001/explain-domains \
     -H "Content-Type: application/json" \
     -d '{"domains": ["google.com", "deepseek.com"]}' | jq
'''