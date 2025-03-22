import os
from openai import OpenAI
import json
import httpx

class LLMClient:
    def __init__(self):
        self.model_name = "doubao-1-5-pro-256k-250115"
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY 环境变量未设置")
            
        print(f"使用API密钥: {api_key[:8]}...")
        self.client = OpenAI(
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            api_key=api_key
        )

    def get_domain_explanations(self, domains):
        """非流式调用获取域名解释"""
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是一个专业的域名分析专家。"
                            "请按照 JSON 格式返回每个域名的主要业务，"
                            "每个域名的解释不超过70个字。"
                            "输出样例如下：\n"
                            "{\n"
                            '    "yandex.ru": "俄罗斯最大的搜索引擎，类似于 Google，同时提供地图、邮件、新闻、翻译等综合服务。",\n'
                            '    "xvideos.com": "成人视频分享平台，用户上传和观看成人内容（需注意年龄限制和网络安全）。",\n'
                            '    "msn.com": "微软旗下的门户网站，提供新闻、天气、财经、娱乐等内容聚合服务。"\n'
                            "}\n"
                        )
                    },
                    {
                        "role": "user",
                        "content": f"请解释以下域名的主要业务：{domains}"
                    }
                ]
            )
            return json.loads(response.choices[0].message.content.strip())
        except Exception as e:
            print(f"调用API时出错: {str(e)}")
            return {}

    def get_domain_explanations_stream(self, domains):
        """流式调用获取域名解释"""
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是一个专业的域名分析专家。请一次返回一个域名的解释，每次都以完整的JSON格式返回。"
                            "每个域名的解释不超过70个字。\n"
                            "比如对于域名列表 ['google.com', 'facebook.com']，你应该这样分别返回：\n"
                            '{"google.com": "全球最大的搜索引擎，提供搜索、邮件、地图等综合服务"}\n'
                            '{"facebook.com": "全球最大的社交平台，用户可以分享照片、视频和交流"}\n'
                            "请注意：\n"
                            "1. 每次只返回一个域名的解释\n"
                            "2. 每次都是一个完整的JSON\n"
                            "3. 解释要简洁准确\n"
                            "4. 每个域名解释独占一行\n"
                        )
                    },
                    {
                        "role": "user",
                        "content": f"请分别解释这些域名的主要业务：{domains}"
                    }
                ],
                stream=True
            )
            
            full_response = ""
            current_json = ""
            
            for chunk in response:
                if chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    full_response += content
                    current_json += content
                    print(content, end='', flush=True)
                    
                    # 检查是否收到了完整的JSON
                    if "}" in current_json:
                        # 分割可能包含多个JSON的字符串
                        parts = current_json.split("\n")
                        new_current = []
                        
                        for part in parts:
                            part = part.strip()
                            if part:  # 忽略空行
                                if part.endswith("}"):
                                    try:
                                        json_obj = json.loads(part)
                                        print("\n收到完整解释:", json_obj)
                                    except json.JSONDecodeError:
                                        new_current.append(part)
                                else:
                                    new_current.append(part)
                        
                        # 保留未完成的JSON部分
                        current_json = "\n".join(new_current)
            
            # 解析最终的完整响应
            all_explanations = {}
            for line in full_response.strip().split('\n'):
                try:
                    if line.strip():
                        explanation = json.loads(line.strip())
                        all_explanations.update(explanation)
                except json.JSONDecodeError:
                    continue
                    
            return all_explanations
        except Exception as e:
            print(f"流式调用API时出错: {str(e)}")
            return {}

    def get_domain_explanations_stream_iter(self, domains):
        """流式调用获取域名解释，使用迭代器返回结果"""
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "你是一个专业的域名分析专家。请一次返回一个域名的解释，每次都以完整的JSON格式返回。"
                            "每个域名的解释不超过70个字。\n"
                            "比如对于域名列表 ['google.com', 'facebook.com']，你应该这样分别返回：\n"
                            '{"google.com": "全球最大的搜索引擎，提供搜索、邮件、地图等综合服务"}\n'
                            '{"facebook.com": "全球最大的社交平台，用户可以分享照片、视频和交流"}\n'
                            '{"live.com": "微软账户登录页面，关联 Outlook 邮箱、OneDrive 云存储、Xbox 账户等服务。"}\n'
                            "请注意：\n"
                            "1. 每次只返回一个域名的解释\n"
                            "2. 每次都是一个完整的JSON\n"
                            "3. 解释要简洁准确\n"
                            "4. 每个域名解释独占一行\n"
                            "5. 要是某些域名比较敏感,不适合解释,那就忽略它继续解释其他的域名\n"
                            "6. 每个域名的解释力求准确\n"
                        )
                    },
                    {
                        "role": "user",
                        "content": f"请分别解释这些域名的主要业务：{domains}"
                    }
                ],
                stream=True
            )
            
            current_json = ""
            
            for chunk in response:
                if chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    current_json += content
                    print(content, end='', flush=True)
                    
                    # 检查是否收到了完整的JSON
                    if "}" in current_json:
                        # 分割可能包含多个JSON的字符串
                        parts = current_json.split("\n")
                        new_current = []
                        
                        for part in parts:
                            part = part.strip()
                            if part:  # 忽略空行
                                if part.endswith("}"):
                                    try:
                                        json_obj = json.loads(part)
                                        # 返回解析出的域名和解释
                                        for domain, explanation in json_obj.items():
                                            yield domain, explanation
                                    except json.JSONDecodeError:
                                        new_current.append(part)
                                else:
                                    new_current.append(part)
                        
                        # 保留未完成的JSON部分
                        current_json = "\n".join(new_current)
            
        except Exception as e:
            print(f"流式调用API时出错: {str(e)}")
            yield None, None