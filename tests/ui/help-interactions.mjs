import assert from 'node:assert/strict';

export async function checkHelpInteractions(browser,origin,user) {
 const results=[];
 for(const width of [390,1366]){
  const account={...user,profile_required:false,session_token:'isolated-help-touch'};
  const page=await browser.newPage({viewport:{width,height:850},hasTouch:true,isMobile:width<700}),errors=[];
  const client=await page.context().newCDPSession(page);
  let comments=[],posted=[],refreshMode='normal',release;
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(value=>sessionStorage.setItem('surface_lab_account',JSON.stringify(value)),account);
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me'||url.pathname==='/api/help-comments/session')return route.fulfill({json:{ok:true,account,teachers:[]}});
   if(url.pathname==='/api/help-comments'){
    if(route.request().method()==='POST'){const data=route.request().postDataJSON();posted.push(data);comments.push({...data,id:posted.length,author_username:account.username,author_name:account.display_name,created_at:new Date().toISOString()});return route.fulfill({json:{ok:true}});}
    if(refreshMode==='hold')await new Promise(resolve=>{release=resolve;});
    if(refreshMode==='fail')return route.fulfill({status:503,json:{ok:false,message:'暂时无法读取讨论，请稍后重试。'}});
    return route.fulfill({json:{ok:true,comments}});
   }
   return route.fulfill({json:{ok:true,comments:[],data:{current_account:account}}});
  });
  const select=async()=>{
   const block=page.locator('.help-article-content [data-help-block] p').first();await block.scrollIntoViewIfNeeded();
   const quote=await block.evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));return selection.toString().trim();});
   await page.locator('.help-selection-bar').waitFor();return quote;
  };
  const composer=()=>page.getByRole('dialog',{name:'评论所选内容',exact:true});
  try{
   await page.goto(origin+'/help');await page.getByRole('button',{name:'刷新讨论',exact:true}).waitFor();
   await select();await page.evaluate(()=>{getSelection().removeAllRanges();document.dispatchEvent(new Event('selectionchange'));});await page.locator('.help-selection-bar').waitFor({state:'detached'});
   const quote=await select(),button=page.getByRole('button',{name:'评论所选内容',exact:true});const box=await button.boundingBox();
   await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
   await page.evaluate(()=>{getSelection().removeAllRanges();document.dispatchEvent(new Event('selectionchange'));});
   await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await composer().waitFor();assert.equal(await composer().locator('blockquote').innerText(),quote);
   await composer().getByRole('textbox').fill('示例手机选区评论');await composer().getByRole('button',{name:'发表评论',exact:true}).click();await composer().waitFor({state:'detached'});
   assert.equal(posted.length,1);assert.equal(posted[0].quote,quote);assert(posted[0].section_id);assert(posted[0].block_id);
   await select();await button.click();await composer().waitFor();await composer().getByRole('button',{name:'取消',exact:true}).click();await composer().waitFor({state:'detached'});
   await select();await button.focus();await page.keyboard.press('Enter');await composer().waitFor();await page.keyboard.press('Escape');await composer().waitFor({state:'detached'});
   // A cancelled touch does not publish or open a stale selection.
   await select();const cancelBox=await button.boundingBox();await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cancelBox.x+10,y:cancelBox.y+10}]});
   await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
   await page.evaluate(()=>{getSelection().removeAllRanges();document.dispatchEvent(new Event('selectionchange'));});await page.locator('.help-selection-bar').waitFor({state:'detached'});assert.equal(await composer().count(),0);
   refreshMode='hold';await page.getByRole('button',{name:'刷新讨论',exact:true}).click();const busy=page.getByRole('button',{name:'刷新中…',exact:true});await busy.waitFor();assert.equal(await busy.isDisabled(),true);
   await page.waitForFunction(()=>Boolean(document.querySelector('[aria-busy="true"]')));while(!release)await page.waitForTimeout(20);refreshMode='normal';release();
   await page.getByText('讨论已刷新',{exact:true}).waitFor();await page.getByText('讨论已刷新',{exact:true}).waitFor({state:'detached',timeout:7000});
   refreshMode='fail';await page.getByRole('button',{name:'刷新讨论',exact:true}).click();await page.getByRole('alert').filter({hasText:'暂时无法读取讨论'}).waitFor();assert.equal(await page.getByRole('button',{name:'刷新讨论',exact:true}).isDisabled(),false);assert.equal(await page.getByText('讨论已刷新',{exact:true}).count(),0);
   refreshMode='normal';await page.getByRole('button',{name:'刷新讨论',exact:true}).click();await page.getByText('讨论已刷新',{exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.deepEqual(errors,[]);
   results.push({width,touchSelection:true,keyboardSelection:true,cancelSelection:true,refreshFeedback:true});
  }finally{release?.();await page.close();}
 }
 return results;
}
