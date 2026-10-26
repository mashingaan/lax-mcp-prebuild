globalThis.fetch=async(url,init)=>{
 if(String(url).endsWith('/submissions')) return Response.json({submission:{id:'s',job_id:'test',status:'received',created_at:'now'}})
 return Response.json({jobs:[],count:0})
}
