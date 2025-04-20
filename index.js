// 导入所需的库
const express = require('express');
const axios = require('axios');
// 注意：如果 apikey 是客户端发送的，理论上后端就不需要 dotenv 来从自己的环境变量加载 apikey 了
// 但如果您还有其他需要从环境变量加载的配置，可以保留 dotenv
// const dotenv = require('dotenv');
// if (process.env.NODE_ENV !== 'production') {
//     dotenv.config();
// }


const app = express();
const port = process.env.PORT || 8000; // 选择一个新端口，例如 8000

const ALPHAVANTAGE_BASE_URL = 'https://www.alphavantage.co/query';

// 根据您提供的截图，定义需要保留的字段白名单
// 注意：白名单中仍然保留原始的字段名，因为过滤是基于原始数据的
const ALLOWED_OVERVIEW_FIELDS = [
    "Symbol",
    "Name",
    "Sector",
    "MarketCapitalization",
    "PERatio",
    "ForwardPE",
    "PriceToSalesRatioTTM",
    "DividendYield", // 注意拼写修正 DividendYield
    "EPS",
    "GrossProfitTTM",
    "ProfitMargin",
    "ReturnOnEquityTTM",
    "QuarterlyEarningsGrowthYOY",
    "QuarterlyRevenueGrowthYOY",
    "LatestQuarter",
    "52WeekHigh", // 仍然在白名单中进行过滤
    "52WeekLow",  // 仍然在白名单中进行过滤
    "AnalystTargetPrice"
];

// 简单的 JSON 过滤函数（仅处理顶级字段）
function filterOverviewJson(data, allowedFields) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return data;
    }

    const filteredData = {};
    for (const field of allowedFields) {
        if (data.hasOwnProperty(field)) {
            filteredData[field] = data[field];
        }
    }
    return filteredData;
}

// 定义代理接口路由
// 客户端可以通过 GET 请求访问 /api/stock/overview?symbol=股票代码&apikey=您的APIKEY
app.get('/api/stock/overview', async (req, res) => {
    // 从客户端请求的查询参数中获取 symbol 和 apikey
    const symbol = req.query.symbol;
    const apikey = req.query.apikey; // !!! 从客户端接收 apikey !!!

    // 验证 symbol 和 apikey 参数是否存在
    if (!symbol || !apikey) {
        return res.status(400).json({ error: "缺少 'symbol' 或 'apikey' 查询参数" });
    }

    try {
        // 构建发往 Alpha Vantage 的请求参数
        const params = {
            function: 'OVERVIEW', // 固定为 OVERVIEW
            symbol: symbol,       // 从客户端获取的 symbol
            apikey: apikey        // !!! 使用从客户端获取的 apikey !!!
        };

        console.log(`Proxying request for symbol: ${symbol} using client-provided apikey.`);
        // 发起 GET 请求到 Alpha Vantage API
        const alphaVantageResponse = await axios.get(ALPHAVANTAGE_BASE_URL, { params: params });

        // 获取 Alpha Vantage 的响应数据
        const originalJson = alphaVantageResponse.data;

        // 检查 Alpha Vantage 是否返回了错误信息
        if (originalJson && originalJson["Error Message"]) {
             console.error("Alpha Vantage API returned error:", originalJson["Error Message"]);
             return res.status(alphaVantageResponse.status).json({
                 error: "第三方 API 返回错误",
                 details: originalJson["Error Message"]
             });
        }
         if (originalJson && originalJson["Note"]) {
             console.warn("Alpha Vantage Note:", originalJson["Note"]);
         }

        // 过滤 JSON 数据，只保留白名单中的字段
        const filteredJson = filterOverviewJson(originalJson, ALLOWED_OVERVIEW_FIELDS);

        // --- 添加字段重命名逻辑 ---
        // 在过滤后，检查并重命名字段
        if (filteredJson.hasOwnProperty("52WeekHigh")) {
            filteredJson["L52WeekHigh"] = filteredJson["52WeekHigh"];
            delete filteredJson["52WeekHigh"]; // 删除原始字段
        }
        if (filteredJson.hasOwnProperty("52WeekLow")) {
            filteredJson["L52WeekLow"] = filteredJson["52WeekLow"];
            delete filteredJson["52WeekLow"]; // 删除原始字段
        }
        // --- 重命名逻辑结束 ---


        console.log(`Successfully filtered and renamed data for symbol: ${symbol}`);
        // 将过滤并重命名后的 JSON 数据作为响应返回给客户端
        res.status(alphaVantageResponse.status).json(filteredJson);

    } catch (error) {
        console.error('代理请求发生错误:', error.message);
        if (error.response) {
            console.error("错误响应状态码:", error.response.status);
            console.error("错误响应数据:", error.response.data);
            res.status(error.response.status).json({
                error: "第三方 API 请求失败",
                details: error.response.data
            });
        } else if (error.request) {
            console.error("未收到第三方 API 响应");
            res.status(500).json({ error: "无法从第三方 API 获取响应", details: error.message });
        } else {
            console.error("构建代理请求时发生错误");
            res.status(500).json({ error: "后端代理内部错误", details: error.message });
        }
    }
});

// 启动服务器
app.listen(port, '127.0.0.1', () => { // 明确指定监听本地回环地址
    console.log(`股票概览代理服务正在运行，监听端口 http://127.0.0.1:${port}`);
    console.log(`请确保您的反向代理（如 Xray）将 HTTPS 请求转发到此地址和端口。`);
});