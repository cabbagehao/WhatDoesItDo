// 日志函数
function log(message, data = null) {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[Domain Explainer Background ${timestamp}]`, message, data);
    } else {
        console.log(`[Domain Explainer Background ${timestamp}]`, message);
    }
}

// 监听插件安装事件
chrome.runtime.onInstalled.addListener(() => {
    log('插件已安装');
});

// 监听文件变化并自动重载插件
function watchForChanges() {
    log('开始监听文件变化');
    
    // 获取插件ID
    const extensionId = chrome.runtime.id;
    
    // 监听文件变化
    const filesInDirectory = dir => new Promise(resolve =>
        dir.createReader().readEntries(entries => {
            const files = entries.filter(e => e.isFile);
            const directories = entries.filter(e => e.isDirectory);
            Promise.all([...files, ...directories.map(d => filesInDirectory(d))])
                .then(files => [].concat(...files))
                .then(resolve);
        })
    );

    const timestampForFilesInDirectory = dir =>
        filesInDirectory(dir).then(files =>
            files.map(f => f.name + f.lastModifiedDate).join());

    const reload = () => {
        log('检测到文件变化，重新加载插件');
        chrome.runtime.reload();
    };

    const watchChanges = (dir, lastTimestamp) => {
        timestampForFilesInDirectory(dir).then(timestamp => {
            if (!lastTimestamp || (lastTimestamp === timestamp)) {
                setTimeout(() => watchChanges(dir, timestamp), 1000); // 每秒检查一次
            } else {
                reload();
            }
        });
    };

    chrome.runtime.getPackageDirectoryEntry(dir => watchChanges(dir));
    log('文件监听器已启动');
}

// 启动文件监听（仅在开发模式下）
if (chrome.runtime.getManifest().version === '1.0') {
    watchForChanges();
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('收到消息', { request, tabId: sender.tab.id });
    
    if (request.type === 'STATUS') {
        log('处理状态更新', request.active);
        
        // 更新插件图标状态
        chrome.action.setBadgeText({
            text: request.active ? 'ON' : 'OFF',
            tabId: sender.tab.id
        }).then(() => {
            return chrome.action.setBadgeBackgroundColor({
                color: request.active ? '#00FF00' : '#FF0000',
                tabId: sender.tab.id
            });
        }).then(() => {
            log('图标状态更新成功');
            // 立即发送响应
            sendResponse({received: true});
        }).catch(error => {
            log('图标状态更新失败', error);
            sendResponse({received: false, error: error.message});
        });
    }
    // 返回true表示将异步发送响应
    return true;
}); 