import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('table loading preserves headers and controls and survives rapid navigation', () => {
  class Element {
    constructor(tag='DIV') { this.tagName=tag; this.children=[]; this.attributes={}; this.style={}; this.classes=new Set(); this.classList={contains:x=>this.classes.has(x),add:x=>this.classes.add(x),remove:x=>this.classes.delete(x)}; }
    append(...children) { for(const child of children) { child.parentElement=this; this.children.push(child); } }
    before(sibling) { this.parentElement.append(sibling); }
    remove() { this.parentElement.children=this.parentElement.children.filter(x=>x!==this); }
    setAttribute(k,v) {this.attributes[k]=v;} removeAttribute(k) {delete this.attributes[k];}
    closest(selector) {return selector==='table'?table:wrap;}
  }
  const wrap=new Element(),table=new Element('TABLE'),head=new Element('THEAD'),body=new Element('TBODY'),filters=new Element();
  wrap.append(table);table.append(head,body);table.querySelectorAll=()=>Array(8).fill(head);
  const chart=new Element(),panel=new Element();panel.append(chart);
  const elements={'#conversationRows':body,'#costChart':chart};
  const state={view:'conversations',dataMode:'centralized'};
  const context=vm.createContext({state,$:s=>elements[s],t:k=>k,document:{createElement:tag=>new Element(tag.toUpperCase())}});
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  vm.runInContext(source.slice(source.indexOf('const loadingRegions ='),source.indexOf('\nfunction render()')),context);
  vm.runInContext('setPageLoading(true); setPageLoading(true)',context);
  assert.equal(body.children.length,1,'one overlay despite repeated sorting');
  assert.equal(body.children[0].children[0].colSpan,8);
  assert.equal(body.attributes['aria-busy'],'true');
  assert.deepEqual(head.attributes,{}); assert.deepEqual(filters.attributes,{});
  assert.equal(table.children[0],head);
  state.view='overview';vm.runInContext('setPageLoading(true)',context);
  assert.equal(body.attributes['aria-busy'],undefined);
  assert.equal(wrap.children.length,1);
  assert.equal(chart.attributes['aria-busy'],'true');
  vm.runInContext('setPageLoading(false)',context);
  assert.equal(chart.attributes['aria-busy'],undefined);
});
