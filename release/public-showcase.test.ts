import {describe,it,expect} from 'vitest';
import {usesCallBulletShowcase,websiteShowcase,hasCustomShowcase} from './replacements/source/src/lib/brand-dna';
import {socialTileDirection} from './replacements/source/src/lib/brand-dna-direction';
describe('public showcase replacement',()=>{
 it('uses generic creation for arbitrary brands and preserves own showcase detection',()=>{
  const external={name:'Example Brand',website:'https://example.invalid'}; expect(usesCallBulletShowcase(external)).toBe(false); expect(websiteShowcase(external)).toBeUndefined(); expect(hasCustomShowcase(external)).toBe(false);
  expect(hasCustomShowcase({name:'AutoTill',website:'https://autotill.com'})).toBe(true);
 });
 it('uses the generic supplied palette for ordinary brands',()=>{
  const result=socialTileDirection({name:'Example Brand',website:'https://example.invalid',colours:[{role:'primary',hex:'#112233',surface:'public',evidence:{status:'observed'}}],fonts:[]} as any);expect(result.accent).toBe('#112233');
 });
});
