const {fetchProduct}=require('../cloud-functions/ydb-stage1/function/parket-sale');
fetchProduct().then(product=>console.log(JSON.stringify(product))).catch(error=>{console.error(error.message);process.exitCode=1});
