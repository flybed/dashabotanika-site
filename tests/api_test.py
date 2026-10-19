"""Проверка правил доступа и автоматических уровней PocketBase.
Запуск против локального PocketBase с чистой базой и суперпользователем:
  PB_URL=http://127.0.0.1:8099 SU_EMAIL=admin@test.local SU_PASS=... python3 tests/api_test.py
"""
import json, os, time, urllib.request, urllib.error
B=os.environ.get('PB_URL','http://127.0.0.1:8099')+'/api'
SU=(os.environ.get('SU_EMAIL','admin@test.local'), os.environ.get('SU_PASS','Passw0rd123'))
def req(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(B+path, data=data, method=method, headers={'Content-Type':'application/json', **({'Authorization':token} if token else {})})
    try:
        with urllib.request.urlopen(r) as resp: return resp.status, json.loads(resp.read() or b'{}')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
ok=True
def check(name, cond, info=''):
    global ok
    print(('PASS ' if cond else 'FAIL ')+name, '' if cond else info); ok &= bool(cond)
chars = req('GET','/collections/characters/records?sort=sort')[1]['items']
eleph = chars[0]['id']
st,_ = req('POST','/collections/users/records',{'email':'a@t.local','password':'secret1234','passwordConfirm':'secret1234','name':'Аня','character':eleph,'role':'admin'})
check('register with role rejected', st>=400, st)
st,_ = req('POST','/collections/users/records',{'email':'a@t.local','password':'secret1234','passwordConfirm':'secret1234','name':'Аня'})
check('register without character rejected', st>=400, st)
st,a = req('POST','/collections/users/records',{'email':'a@t.local','password':'secret1234','passwordConfirm':'secret1234','name':'Аня','character':eleph})
check('register ok', st==200, a)
st,b = req('POST','/collections/users/records',{'email':'b@t.local','password':'secret1234','passwordConfirm':'secret1234','name':'Борис','character':chars[1]['id']})
time.sleep(3.1)
ta = req('POST','/collections/users/auth-with-password',{'identity':'a@t.local','password':'secret1234'})[1]['token']
time.sleep(3.1)
tb = req('POST','/collections/users/auth-with-password',{'identity':'b@t.local','password':'secret1234'})[1]['token']
st,u = req('GET','/collections/users/records/'+a['id'])
check('public profile, email hidden, level 1', st==200 and u.get('email','')=='' and u['level']==1, u)
st,_ = req('PATCH','/collections/users/records/'+a['id'],{'level':5},ta); check('cannot set own level', st>=400, st)
st,_ = req('PATCH','/collections/users/records/'+a['id'],{'role':'admin'},ta); check('cannot set own role', st>=400, st)
st,_ = req('PATCH','/collections/users/records/'+b['id'],{'name':'xx'},ta); check('cannot edit other user', st>=400, st)
st,_ = req('POST','/collections/reviews/records',{'author':b['id'],'rating':5,'text':'fake'},ta); check('cannot post as other', st>=400, st)
st,rv = req('POST','/collections/reviews/records',{'author':a['id'],'rating':5,'text':'Отличный сайт'},ta); check('review ok', st==200, rv)
st,_ = req('DELETE','/collections/reviews/records/'+rv['id'],None,tb); check('other cannot delete review', st>=400, st)
log={f'2026-10-{d:02d}':['h1','h2'] for d in range(1,7)}
st,hb = req('POST','/collections/habits/records',{'owner':a['id'],'data':{'habits':[],'log':log}},ta); check('habits ok', st==200, hb)
st,_ = req('GET','/collections/habits/records/'+hb['id'],None,tb); check('habits private', st>=400, st)
req('PATCH','/collections/users/records/'+a['id'],{'exam_best':6},ta)
u = req('GET','/collections/users/records/'+a['id'])[1]
check('auto level 2 (12 leaves, exam 6)', u['level']==2 and u['leaves']==12 and len(u['level_history'])==2, u)
# listings
st,li = req('POST','/collections/listings/records',{'seller':a['id'],'title':'Шопер','kind':'Отдам даром'},ta); check('listing ok', st==200, li)
st,lst = req('GET','/collections/listings/records'); check('pending listing hidden from public', lst['totalItems']==0, lst)
st,_ = req('PATCH','/collections/listings/records/'+li['id'],{'moderation':'approved'},ta); check('seller cannot approve', st>=400, st)
st,_ = req('PATCH','/collections/listings/records/'+li['id'],{'status':'reserved'},ta); check('seller can set status', st==200, st)
# superuser makes B moderator
time.sleep(3.1)
su = req('POST','/collections/_superusers/auth-with-password',{'identity':SU[0],'password':SU[1]})[1]['token']
st,_ = req('PATCH','/collections/users/records/'+b['id'],{'role':'moderator'},su); check('superuser sets role', st==200, st)
time.sleep(3.1)
tb = req('POST','/collections/users/auth-with-password',{'identity':'b@t.local','password':'secret1234'})[1]['token']
st,_ = req('PATCH','/collections/listings/records/'+li['id'],{'moderation':'approved'},tb); check('moderator approves', st==200, st)
st,lst = req('GET','/collections/listings/records'); check('approved listing public', lst['totalItems']==1, lst)
# chats
st,ch = req('POST','/collections/chats/records',{'key':'L'+li['id']+'_'+b['id'],'title':'Шопер','listing':li['id'],'seller':a['id'],'buyer':b['id'],'last_from':b['id'],'last_at':1},tb); check('chat ok', st==200, ch)
st,m = req('POST','/collections/messages/records',{'chat':ch['id'],'from':b['id'],'text':'Привет'},tb); check('message ok', st==200, m)
st,ms = req('GET','/collections/messages/records',None,ta); check('seller sees message', ms.get('totalItems')==1, ms)
st,ms = req('GET','/collections/messages/records'); check('anon sees no messages', ms.get('totalItems')==0, ms)
# site item chat (seller empty) visible to moderator
st,ch2 = req('POST','/collections/chats/records',{'key':'Sm1_'+a['id'],'title':'Платье','buyer':a['id'],'last_from':a['id'],'last_at':1},ta); check('site chat ok', st==200, ch2)
st,cl = req('GET','/collections/chats/records',None,tb); check('moderator sees site chat + own', cl.get('totalItems')==2, cl)
# suggestions
st,sg = req('POST','/collections/suggestions/records',{'author':a['id'],'kind':'Статья','title':'Идея','text':'Текст'},ta); check('suggestion ok', st==200, sg)
st,_ = req('PATCH','/collections/suggestions/records/'+sg['id'],{'status':'accepted'},ta); check('author cannot accept', st>=400, st)
st,_ = req('PATCH','/collections/suggestions/records/'+sg['id'],{'status':'accepted'},tb); check('moderator accepts', st==200, st)
# content
c = req('GET','/collections/content/records?filter=key%3D%22site%22')[1]['items'][0]
st,_ = req('PATCH','/collections/content/records/'+c['id'],{'data':c['data']},ta); check('member cannot edit content', st>=400, st)
st,_ = req('PATCH','/collections/content/records/'+c['id'],{'data':c['data']},tb); check('moderator edits content', st==200, st)
print('ALL OK' if ok else 'SOME FAILED')
