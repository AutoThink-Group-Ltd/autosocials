import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({chat:vi.fn(),context:vi.fn()}));
vi.mock('./dossier.server',()=>({aiChat:mocks.chat}));
vi.mock('./creative-context.server',()=>({loadCreativeContext:mocks.context}));
vi.mock('./creative-providers/adapters.server',()=>({getCreativeProviderAvailability:()=>[
  {capabilityId:'autotoast-hyperframes',available:true}, {capabilityId:'higgsfield-seedance-text-video',available:true},
],listCreativeProviderPresets:vi.fn()}));
vi.mock('./playbook.server',()=>({HOUSE_RULES:'Preserve facts',CREATIVE_PLAYBOOK:'Follow the user direction'}));
import { planProductionAssets } from './creative-planning.server';
import { CREATIVE_DIRECTION_SCHEMA } from './creative-direction';
const direction=Object.fromEntries(Object.keys(CREATIVE_DIRECTION_SCHEMA.properties).map(key=>[key,`Specific ${key} for an illustrative London film`]));
const picked={id:'request',title:'London living',message:'Create an illustrative London city journey.',why:'User direction',selected:true};
const spec={narrative:picked.title,duration:30 as const,size:'1080x1920',style_id:'cinematic-scene' as const,model_choice:'user' as const};
const plan=()=>({title:'London story',audience:'London residents',offer:'',voice:'Kore',voice_reason:'Warm voice',variants:[{day:1,angle:picked.title,argument:'London lifestyle',hook:'Arrive in London',format:'Cinematic film',duration_s:30,size:'1080x1920',beats:['Arrival','Belonging'],voiceover:'Imagine a new day in London. Discover its streets and make yourself at home.',script:'Illustrative city journey, not actual listings.',caption:'London living',cta:'Discover more',file_ids:[],style_id:'cinematic-scene',production_plan:{direction,assumptions:['Generated scenes are illustrative.'],steps:[{id:'city',capability_id:'higgsfield-seedance-text-video',purpose:'Illustrative city arrival',role:'scene',settings_json:JSON.stringify({prompt:'An illustrative London skyline in natural light.',duration:15,aspect_ratio:'9:16',generate_audio:false}),reference_file_ids:[],reference_step_ids:[],reference_roles:[],illustrative:true}]}}]});
const reply=(value:unknown)=>({choices:[{message:{content:JSON.stringify(value)}}]});
const call=()=>planProductionAssets({admin:{} as never,workspaceId:'ours',picked:[picked],specs:[spec],allowedFileIds:[],userDirected:true});
beforeEach(()=>{vi.clearAllMocks();mocks.context.mockResolvedValue({text:'London estate agency. Generated scenes must be illustrative.',files:[],recent:[],evidence:[],imageParts:[]});});
describe('user-directed Models planning',()=>{
 it('keeps a standalone video choice in the saved production plan',async()=>{
  mocks.context.mockResolvedValue({text:'A standalone city film.',files:[],recent:[],evidence:[],imageParts:[]});
  mocks.chat.mockResolvedValueOnce(reply(plan())).mockResolvedValueOnce(reply({blocking_issues:[],creative_issues:[]}));
  const result=await planProductionAssets({admin:{} as never,workspaceId:'ours',picked:[{ ...picked, context_mode:'standalone' }],specs:[spec],allowedFileIds:[],userDirected:true});
  expect(mocks.context).toHaveBeenCalledWith(expect.anything(),'ours',picked.message,[],undefined,'standalone');
  expect(result.variants[0].production_plan).toMatchObject({standalone:true,selected_files_only:true});
 });
 it('keeps the established planner and creative rework for other creation flows',async()=>{
  mocks.chat.mockResolvedValueOnce(reply(plan())).mockResolvedValueOnce(reply({blocking_issues:[],creative_issues:['Try a different opening.']})).mockResolvedValueOnce(reply(plan())).mockResolvedValueOnce(reply({blocking_issues:[],creative_issues:[]}));
  await planProductionAssets({admin:{} as never,workspaceId:'ours',picked:[picked],specs:[spec]});
  expect(mocks.chat).toHaveBeenCalledTimes(4);
  for(const [body] of mocks.chat.mock.calls){
    expect(body).toMatchObject({model:'openai/gpt-6-astra',reasoning_effort:'medium'});
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body.messages[0].content).not.toContain('London estate agency');
    expect(body.messages[1].content).toContain('London estate agency');
  }
 });
 it('supports prompt-only 30s Cinematic through short scenes and keeps nonblocking notes without an extra rewrite',async()=>{
  mocks.chat.mockResolvedValueOnce(reply(plan())).mockResolvedValueOnce(reply({blocking_issues:[],creative_issues:['Consider a quieter ending.']}));
  const result=await call();
  expect(result.variants[0].duration_s).toBe(30);
  expect(result.variants[0].production_plan.steps[0]).toMatchObject({capability_id:'higgsfield-seedance-text-video',role:'scene',reference_file_ids:[]});
  expect(result.variants[0].production_plan.diversity_issues).toContain('Consider a quieter ending.');
  expect(mocks.chat).toHaveBeenCalledTimes(2);
  for(const [body] of mocks.chat.mock.calls)expect(body).toMatchObject({model:'gpt-5.4-mini',reasoning_effort:'low',max_completion_tokens:12000});
  expect(mocks.chat.mock.calls[0][0].messages[0].content).toContain('Do not request a 30s provider clip');
  const references=mocks.chat.mock.calls[0][0].response_format.json_schema.schema.properties.variants.items.properties.production_plan.properties.steps.items.properties;
  for(const key of ['reference_file_ids','reference_step_ids','reference_roles'])expect(references[key].maxItems).toBe(0);
  expect(mocks.chat.mock.calls[0][0].response_format.json_schema.schema.properties.variants.items.properties.file_ids.maxItems).toBe(0);
 });
 it('keeps fabricated reference roles out of the production plan',async()=>{
  const invalid=plan();(invalid.variants[0].production_plan.steps[0].reference_roles as unknown[])=[{source:'file',id:'invented-reference',role:'style'}];
  mocks.chat.mockResolvedValueOnce(reply(invalid)).mockResolvedValueOnce(reply({blocking_issues:[],creative_issues:[]}));
  const result = await call();
  expect(result.variants[0].production_plan.steps[0].reference_roles).toEqual([]);
 });
 it('still repairs blocking findings and refuses a plan that fails review twice',async()=>{
  mocks.chat.mockResolvedValueOnce(reply(plan())).mockResolvedValueOnce(reply({blocking_issues:['Unsupported property claims'],creative_issues:[]})).mockResolvedValueOnce(reply(plan())).mockResolvedValueOnce(reply({blocking_issues:['Unsupported property claims'],creative_issues:[]}));
  await expect(call()).rejects.toThrow('Unsupported property claims');
  expect(mocks.chat).toHaveBeenCalledTimes(4);
 });
 it('never admits an unsupported 30s finished provider clip',async()=>{
  const invalid=plan();invalid.variants[0].production_plan.steps[0].role='finished_video';
  mocks.chat.mockResolvedValue(reply(invalid));
  await expect(call()).rejects.toThrow('exact finished duration');
  expect(mocks.chat).toHaveBeenCalledTimes(2);
 });
});
