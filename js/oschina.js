let Utils = {
    object: {
        isNull(obj) {
            return typeof obj === "undefined" || obj === null;
        },
        isNotNull(obj) {
            return !this.isNull(obj);
        }
    },
    chromePlugin: {
        placeholderReg: '\\${([^{}]+)}',
        storagePrefix: {
            '_': '',
            'config': 'config_'
        },
        handleStorageKeyPrefix({ key, prefix = '_' } = {}) {
            let text = '';
            if (this.storagePrefix[prefix]) {
                text += this.storagePrefix['_'];
                if (prefix !== '_') {
                    text += this.storagePrefix[prefix];
                }
            }
            return text + key
        },
        handleStorageKeysPrefix({ keys, prefix } = {}) {
            if (!this.storagePrefix[prefix]) return keys;
            if (typeof keys === "string") {
                keys = [keys];
            }
            if (keys instanceof Array) {
                for (let i = 0, len = keys.length; i < len; i++) {
                    keys[i] = this.handleStorageKeyPrefix({ key: keys[i], prefix });
                }
            } else {
                keys = null;
            }
            return keys;
        },
        async storageGet({ keys, prefix = null } = {}) {
            return new Promise((resolve, reject) => {
                const isOne = typeof keys === "string";
                try {
                    keys = this.handleStorageKeysPrefix({ keys, prefix });
                    chrome.storage.local.get(keys, (json) => {
                        if (!json) {
                            resolve(json)
                            return
                        }
                        if (isOne && keys) {
                            resolve(json[keys[0]])
                        } else {
                            const prefixStr = this.handleStorageKeyPrefix({ key: '', prefix });
                            const newJson = {};
                            for (const jk in json) {
                                if (!json.hasOwnProperty(jk)) continue;
                                if (!jk.startsWith(prefixStr)) continue;
                                newJson[jk.replace(prefixStr, '')] = json[jk];
                            }
                            resolve(newJson)
                        }
                    })
                } catch (e) {
                    reject(e);
                }
            })
        },
        async storageSet({ map, prefix = null } = {}) {
            return new Promise((resolve, reject) => {
                try {
                    if (this.storagePrefix[prefix]) {
                        const newMap = {};
                        for (let key in map) {
                            if (!map.hasOwnProperty(key)) continue;
                            newMap[this.handleStorageKeyPrefix({ key, prefix })] = map[key];
                        }
                        map = newMap;
                    }
                    chrome.storage.local.set(map, () => {
                        resolve();
                    })
                } catch (e) {
                    reject(e);
                }
            })
        },
        async storageRemove({ keys, prefix = null } = {}) {
            return new Promise((resolve, reject) => {
                try {
                    keys = this.handleStorageKeysPrefix({ keys, prefix });
                    chrome.storage.local.remove(keys, () => {
                        resolve();
                    })
                } catch (e) {
                    reject(e);
                }
            })
        }
    }
};


function getRssData(rssLink, divId) {

    var xhr = new XMLHttpRequest();

    setLoadingLabel(divId);

    xhr.onreadystatechange = function () {

        if (xhr.readyState != 4) {
            return;
        }

        var responseXML = xhr.responseXML;
        if (!responseXML) {
            try {
                responseXML = (new DOMParser()).parseFromString(xhr.responseText.replace(/[\x00-\x1F]/g, ' '), 'text/xml');
            } catch (e) {
                console.log('error->', error);
                setErrorLabel(divId, 'text转换xml出错');
            }
        }
        if (responseXML) {
            getAllSubBookmark().then((allSubBookmark) => {
                var xmlDoc = responseXML;
                var fullCountSet = xmlDoc.evaluate("//channel/item", xmlDoc, createNSResolver, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                try {
                    var fullCountNode = fullCountSet.iterateNext();
                    var divContent = '';
                    while (fullCountNode) {
                        divContent += constructListDiv(constructRssItem(fullCountNode), allSubBookmark);
                        fullCountNode = fullCountSet.iterateNext();
                    }
                    if (divContent) {
                        document.getElementById(divId).innerHTML = divContent;
                    }
                } catch (error) {
                    console.log('error->', error);
                    setErrorLabel(divId, '数据解析错误');
                } //end of try-catch
            });

        } //end of if(xhr.responseXML)
    };

    xhr.onerror = function (error) {
        console.error('error->', error);
        setErrorLabel(divId, '网络错误');
    };

    xhr.open("GET", rssLink, true);
    xhr.send(null);
} //end of function getRssData()

function constructRssItem(xmlNode) {
    var title = xmlNode.getElementsByTagName("title")[0].firstChild.nodeValue;
    var description = xmlNode.getElementsByTagName("description")[0].firstChild.nodeValue;
    var link = xmlNode.getElementsByTagName("link")[0].firstChild.nodeValue;
    var pubDate = xmlNode.getElementsByTagName("pubDate")[0].firstChild.nodeValue;
    var guid = xmlNode.getElementsByTagName("guid")[0].firstChild.nodeValue;
    return new RssItem(title, description, link, pubDate, guid);
}

function constructListDiv(item, bookmarks = []) {
    const bookmark = bookmarks.find(b => item.link === b.url);
    return `
<div class="item"><a target="_blank" href="${item.link +
        '?' +
        UTM_SOURCE_STR}">\
<div class="title">${stripHtml(item.title)}</div></a>\
<div is-icon-heart ${bookmark
            ? `class="icon-heart-fill collected"  data-bookmark-id="${bookmark.id}"`
            : 'class="icon-heart-fill"'
        }\
 data-title="${stripHtml(item.title)}" data-link="${item.link}"></div>\
<div class="description">${stripHtml(item.description)}</div>\
<div class="pubDate">${item.pubDate}</div></div>`;
}

function RssItem(title, description, link, pubDate, guid) {
    this.title = title;
    this.description = description;
    this.link = link;
    this.pubDate = new Intl.DateTimeFormat('zh-CN').format(Date.parse(pubDate));
    this.guid = guid;
}

function createNSResolver(xmlDoc) {
    return xmlDoc.createNSResolver(xmlDoc.ownerDocument == null ? xmlDoc.documentElement : xmlDoc.ownerDocument.documentElement);
}

function setLoadingLabel(divId) {
    document.getElementById(divId).innerHTML = '<p style="text-align:center;font-size:20px">Loading ... </p>';
}

function setErrorLabel(divId, error) {
    document.getElementById(divId).innerHTML = '<p style="color:red;text-align:center;font-size:22px">Error (' + error + ') </p>';
}

// 创建书签到书签栏最前端,不传 url 即为创建文件夹
function createBookmark(title = OSC_BOOKMARKS_NAME, parentId = '1', url = '') {
    return new Promise(function (resolve) {
        let prams = {
            parentId: parentId,
            index: 0,
            title: title
        };

        if (url) {
            prams.url = url;
        }

        chrome.bookmarks.create(prams, (bookmarkData) => {
            resolve(bookmarkData);
        });
    });

}

// 查找书签文件夹 ,并返回文件夹信息,如果已创建则直接返回文件夹信息
function searchBookmarksFolder() {
    return new Promise(function (resolve) {
        // 查找名含 OSC_BOOKMARKS_NAME 的书签
        chrome.bookmarks.search(OSC_BOOKMARKS_NAME, (searchResult) => {
            const isIncludeBookmark = Array.isArray(searchResult) && searchResult.length > 0;
            if (isIncludeBookmark) {
                // 存在名为 OSC_BOOKMARKS_NAME 的书签文件夹: title相同 且 不存在url属性
                let index = searchResult.findIndex((item) => item.title === OSC_BOOKMARKS_NAME && !item.url)
                if (index > -1) {
                    resolve(searchResult[index])
                } else {
                    createBookmark().then((bookmarkData) => {
                        resolve(bookmarkData);
                    })
                }
            } else {
                // 不存在任何包含 OSC_BOOKMARKS_NAME 的书签或文件夹
                createBookmark().then((bookmarkData) => {
                    resolve(bookmarkData);
                })
            } //end of if-else
        }); //end of Promise()
    }); //end of function searchBookmarksFolder
}

let allSubBookmark = [];

function getAllSubBookmark({ title = OSC_BOOKMARKS_NAME, cache = false } = {}) {
    return new Promise((resolve) => {
        if (cache && allSubBookmark && allSubBookmark.length > 0) {
            resolve(allSubBookmark);
        }
        chrome.bookmarks.search(title, async (searchResult) => {
            if (!searchResult) {
                resolve([]);
            }
            const bookmarks = [];
            const dirs = searchResult.filter((item) => item.title === title && !item.url);
            for (let i = 0, len = dirs.length; i < len; i++) {
                const dir = dirs[i];
                await new Promise(resolveSubTree => chrome.bookmarks.getSubTree(dir.id, async (subTree) => {
                    if (!subTree) {
                        resolveSubTree();
                    }
                    const HandleTree = (items) => {
                        items.forEach(item => {
                            if (item.children) {
                                HandleTree(item.children)
                            } else {
                                if (!item.url) return;
                                bookmarks.push({ ...item })
                            }
                        })
                    }
                    HandleTree(subTree);
                    resolveSubTree();
                }))
            }
            allSubBookmark = bookmarks;
            resolve(bookmarks)
        });
    });
}

/**
 * 获取开源资讯数据
 * @param selectedValue
 */
function getRssNewsRssData(selectedValue = 'all') {
    Utils.chromePlugin.storageSet({ map: { 'rssNewsSelected': selectedValue }, prefix: 'config' })
    handleSelect('news-selector', selectedValue);
    setLoadingLabel('news-list');
    if (selectedValue === 'all') {
        getRssData(RSS_NEWS, 'news-list');
    } else {
        getRssData(RSS_NEWS_PREFIX + selectedValue, 'news-list');
    }
}

/**
 * 获取推荐博客数据
 * @param selectedValue
 */
function getBlogsListRssData(selectedValue = 'all') {
    Utils.chromePlugin.storageSet({ map: { 'blogsListSelected': selectedValue }, prefix: 'config' })
    handleSelect('blogs-selector', selectedValue);
    setLoadingLabel('blogs-list');
    if (selectedValue === 'all') {
        getRssData(RSS_RECOMM_BLOGS, 'blogs-list');
    } else {
        getRssData(RSS_RECOMM_BLOGS_CATEGORY_PREFIX + selectedValue, 'blogs-list');
    }
}

/**
 * 获取开源软件数据
 * @param selectedValue
 */
function getProjectsListRssData(selectedValue = 'all') {
    Utils.chromePlugin.storageSet({ map: { 'projectsListSelected': selectedValue }, prefix: 'config' })
    handleSelect('projects-selector', selectedValue);
    setLoadingLabel('projects-list');
    if (selectedValue === 'recomm') {
        getRssData(RSS_RECOMM_PROJECTS, 'projects-list');
    } else {
        getRssData(RSS_PROJECTS, 'projects-list');
    }
}

/**
 * 获取最新问答数据
 * @param selectedValue
 */
function getQuestionsListRssData(selectedValue = '1') {
    Utils.chromePlugin.storageSet({ map: { 'questionsListSelected': selectedValue }, prefix: 'config' })
    handleSelect('questions-selector', selectedValue);
    setLoadingLabel('questions-list');
    getRssData(RSS_QUESTIONS_PREFIX + selectedValue, 'questions-list');
}

/**
 * 获取专区文章数据
 * @param selectedValue
 */
function getCircleArticlesListRssData(selectedValue = 'cross-front') {
    Utils.chromePlugin.storageSet({ map: { 'circleArticlesListSelected': selectedValue }, prefix: 'config' })
    handleSelect('circle-selector', selectedValue);
    setLoadingLabel('blogs-list');
    if (selectedValue === 'cross-front') {
        getRssData(RSS_CIRCLE_ARTICLES_PREFIX + 'cross-front', 'blogs-list');
    } else {
        getRssData(RSS_CIRCLE_ARTICLES_PREFIX + selectedValue, 'blogs-list');
    }
}

function handleSelect(selectId, val) {
    const ele = document.getElementById(selectId);
    if (ele.value === val) {
        return;
    }
    ele.value = val;
}

////////////////// 页面上的各类时间点击  ///////////////////////
Utils.chromePlugin.storagePrefix._ = '_ydA2ge_';
getAllSubBookmark();
document.addEventListener('DOMContentLoaded', async function () {
    const config = await Utils.chromePlugin.storageGet({
        prefix: 'config'
    }) || {};
    // DOM内容加载完成之后，开始获取数据并展示
    getRssNewsRssData(config.rssNewsSelected); //最新资讯
    getQuestionsListRssData(config.questionsListSelected); //最新发布问答
    //getBlogsListRssData(config.blogsListSelected); //最新推荐博客
    getCircleArticlesListRssData(config.circleArticlesListSelected);//专区文章列表
    getProjectsListRssData(config.projectsListSelected); //最新收录开源软件

    // //下载源码按钮点击事件
    document.getElementById('btn-download').onclick = function () {
        chrome.tabs.create({
            'url': GITEE_REPO_URL
        });
    };

    //搜索按钮点击事件
    document.getElementById('btn-search').onclick = function () {
        var txtSearch = document.getElementById('txt-search').value;
        if (txtSearch) {
            var query = encodeURIComponent(txtSearch);
            chrome.tabs.create({
                'url': OSC_SEARCH_PREFIX + query + '&' + UTM_SOURCE_STR
            });
        } //end of if
    };

    //搜索输入框中的回车事件
    document.getElementById('txt-search').onkeydown = function (event) {
        if (event.keyCode == 13) {
            document.getElementById('btn-search').click();
        }
    };


    //标题「开源资讯」的点击事件
    document.getElementById('news-title').onclick = function (event) {
        var selectedValue = document.getElementById('news-selector').value;
        if (selectedValue) {
            getRssNewsRssData(selectedValue);
        }
    };

    //标题「推荐博客」的点击事件
    document.getElementById('blogs-title').onclick = function (event) {
        var selectedValue = document.getElementById('circle-selector').value;
        if (selectedValue) {
            getCircleArticlesListRssData(selectedValue);//专区文章列表
        }
    };

    //标题「开源软件」的点击事件
    document.getElementById('projects-title').onclick = function (event) {
        var selectedValue = document.getElementById('projects-selector').value;
        if (selectedValue) {
            getProjectsListRssData(selectedValue);
        }
    };

    //标题「最新问答」的点击事件
    document.getElementById('questions-title').onclick = function (event) {
        var selectedValue = document.getElementById('questions-selector').value;
        if (selectedValue) {
            getQuestionsListRssData(selectedValue);
        }
    };

    //资讯：下拉框的变化事件
    document.getElementById('news-selector').onchange = function (event) {
        document.getElementById('news-title').click();
    };

    //专区文章：下拉框的变化事件
    document.getElementById('circle-selector').onchange = function (event) {
        document.getElementById('blogs-title').click();
    };

    //问答：下拉框的变化事件
    document.getElementById('questions-selector').onchange = function (event) {
        document.getElementById('questions-title').click();
    };

    //软件：下拉框的变化事件
    document.getElementById('projects-selector').onchange = function (event) {
        document.getElementById('projects-title').click();
    };

    // 收藏：心形图标点击事件
    // 各个list列表容器。数据未加载 ,dom未生成,不能绑定在.heart元素上
    const arrListContainer = [
        ...document.querySelectorAll(
            '#news-list,#blogs-list,#projects-list,#questions-list'
        )
    ];
    for (let oItem of arrListContainer) {
        oItem.addEventListener('click', async event => {
            const ele = event.target;
            let targetDataset = ele.dataset;
            const isIconHeart = ele.hasAttribute('is-icon-heart');
            // 判断事件是否在 icon-heart上触发
            if (!isIconHeart) {
                return false;
            }
            if (targetDataset.bookmarkId) {
                chrome.bookmarks.remove(
                    targetDataset.bookmarkId,
                    async bookmarkData => {
                        console.log(bookmarkData);
                        await getAllSubBookmark();
                        ele.removeAttribute('data-bookmark-id');
                        ele.className = ele.className.replace(' collected', '');
                    }
                );
                return;
            }
            const bookmarkFolder = await searchBookmarksFolder();
            // 创建书签 不带http或https 会抛出错误,添加http://
            if (
                targetDataset.link &&
                !/^http:\/\//.test(targetDataset.link) &&
                !/^https:\/\//.test(targetDataset.link)
            ) {
                targetDataset.link = 'http://' + targetDataset.link;
            }
            const bookmarkData = await createBookmark(
                targetDataset.title || '无标题',
                bookmarkFolder.id,
                targetDataset.link
            );
            await getAllSubBookmark();
            ele.setAttribute('data-bookmark-id', bookmarkData.id);
            ele.className = ele.className + ' collected';
        });
    }
});