import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const legacy=require('minimatch');
const modern=createRequire(require.resolve('@typescript-eslint/typescript-estree'))('minimatch');

test('patched matching keeps both legacy callable and modern named interfaces',()=>{
  assert.equal(typeof legacy,'function');assert.equal(typeof modern.minimatch,'function');
  for(const match of [legacy,modern.minimatch]) {
    assert.equal(match('components/Button.tsx','**/*.tsx'),true);
    assert.equal(match('Button','B*',{noglobstar:true}),true);
    assert.equal(match('.hidden','*'),false);assert.equal(match('.hidden','*',{dot:true}),true);
  }
  assert.ok(new legacy.Minimatch('**/*.js').match('lib/a.js'));
  assert.deepEqual(legacy.match(['a.js','b.ts'],'*.js'),['a.js']);
  assert.equal(['a.js','b.ts'].filter(legacy.filter('*.js')).length,1);
  assert.equal(legacy.defaults({nocase:true})('Button','button'),true);
});

test('upstream patched matcher bounds globparts amplification',()=>{
  const script=`const mm=require(${JSON.stringify(require.resolve('minimatch-core'))});const pattern='a/'+ '**/../'.repeat(24)+'z';new mm.Minimatch(pattern,{optimizationLevel:2}).match('a/z');`;
  const result=spawnSync(process.execPath,['-e',script],{timeout:3000,encoding:'utf8'});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
});
