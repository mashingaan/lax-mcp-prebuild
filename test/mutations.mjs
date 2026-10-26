import { readFileSync,writeFileSync,mkdtempSync,cpSync,rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const mutants=[
 ['wrong offer route','/offers/','/offer/'],
 ['ignore error status','if (!response.ok)','if (false)'],
 ['error not marked', 'isError: true','isError: false'],
 ['wrong submission job','c.submit(job_id, input)',"c.submit('wrong', input)"],
 ['lost envelope','return envelope','return {}'],
 ['wrong search query','new URLSearchParams({ query })','new URLSearchParams({ q:query })']
]
const source=readFileSync('dist/index.js','utf8')
for(const [name,before,after] of mutants) {
 assert.ok(source.includes(before),'Missing mutation target '+name)
 const dir=mkdtempSync(join(process.cwd(),'.mutant-'))
 try {
  for(const path of ['dist','test','package.json','README.md']) cpSync(path,join(dir,path),{recursive:true})
  const changed=source.replace(before,after)
  writeFileSync(join(dir,'dist/index.js'),changed)
  const syntax=spawnSync(process.execPath,['--check',join(dir,'dist/index.js')],{encoding:'utf8'})
  assert.equal(syntax.status,0,syntax.stderr)
  const result=spawnSync(process.execPath,['--test','test/server.test.mjs','test/transports.test.mjs'],{cwd:dir,encoding:'utf8',timeout:15000})
  assert.equal(result.error,undefined,name)
  assert.ok(result.status>0,name+' survived')
  assert.ok(/AssertionError|ERR_ASSERTION/.test(result.stdout),name+' must reach an assertion')
  assert.ok(!/ERR_MODULE_NOT_FOUND/.test(result.stdout+result.stderr),name+' failed to execute')
  console.log('Killed: '+name)
 } finally {rmSync(dir,{recursive:true,force:true})}
}
