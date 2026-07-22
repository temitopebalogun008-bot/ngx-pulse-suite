exports.handler = async function(event, context) {
    try {
        // Fetch live market data from the NGX Pulse API
        const response = await fetch('https://www.ngxpulse.ng/api/ngxdata/stocks', {
            method: 'GET',
            headers: {
                'X-API-Key': 'ngxpulse_kot6ulanbyk0rl6p',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Upstream API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Return the live stock data with CORS headers enabled for your dashboard
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error("Failed to fetch live NGX market data:", error);
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ 
                error: "Failed to fetch live stock data", 
                details: error.message 
            })
        };
    }
};
