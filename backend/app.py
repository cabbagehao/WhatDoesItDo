from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from openai import OpenAI

app = Flask(__name__)
CORS(app)  # 启用CORS支持

# 初始化OpenAI客户端
# client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

@app.route('/explain-domains', methods=['POST'])
def explain_domains():
    data = request.json
    domains = data.get('domains', [])
    
    if not domains:
        return jsonify({'error': '没有提供域名'}), 400
        
    explanations = {}
    
    try:
        # 批量处理域名
        domains_text = "\n".join(domains)
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "你是一个专业的域名分析专家。请简短解释每个域名的主要业务，每个域名的解释不超过20个字。"},
                {"role": "user", "content": f"请解释以下域名的主要业务，每行一个域名:\n{domains_text}"}
            ]
        )
        
        # 解析响应
        explanation_text = response.choices[0].message.content
        lines = explanation_text.strip().split('\n')
        
        # 将解释与域名对应
        for domain, line in zip(domains, lines):
            # 移除可能的序号和域名本身，只保留解释部分
            explanation = line.split(':')[-1].strip()
            explanations[domain] = explanation
            
    except Exception as e:
        print(f"调用API时出错: {str(e)}")
        # return jsonify({'error': '获取域名解释失败'}), 500

    # 为所有域名返回统一的测试说明
    explanations = {domain: "test1" for domain in domains}        
    return jsonify(explanations)

if __name__ == '__main__':
    app.run(debug=True) 