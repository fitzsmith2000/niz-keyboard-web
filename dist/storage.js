let database;
async function openDatabase() {
  if(database) return database;
  database=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('niz-web-backups',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('backups',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('无法打开本地备份存储。请允许此站点存储数据后再写入。'));
  });
  return database;
}
export async function saveBackup(snapshot,label) {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('backups','readwrite');
    const item={id:crypto.randomUUID(),createdAt:new Date().toISOString(),label,snapshot};
    transaction.objectStore('backups').add(item);
    transaction.oncomplete=()=>resolve(item);
    transaction.onerror=transaction.onabort=()=>reject(new Error('本地备份保存失败，已停止写入。请先导出当前配置并检查浏览器存储。'));
  });
}
export async function backups() {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const request=db.transaction('backups').objectStore('backups').getAll();
    request.onsuccess=()=>resolve(request.result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
    request.onerror=()=>reject(new Error('无法读取本地备份。'));
  });
}
export function download(snapshot,name='NiZ-mini84') {
  const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
  const a=document.createElement('a'); a.href=url; a.download=`${name}-${Date.now()}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
