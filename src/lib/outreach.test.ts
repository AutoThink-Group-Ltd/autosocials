import {describe,it,expect} from "vitest";
import {validateReview, type OutreachReviewSnapshot} from "./outreach";
const review=():OutreachReviewSnapshot=>({sender:{id:"sender",name:"Name",email:"sender@example.com"},signature:"",creators:[{id:"one",version:1,name:"Creator",email:"creator@example.com",subject:"Hello",body:"Message"}]});
describe("outreach review",()=>{
 it("accepts a complete batch",()=>expect(validateReview(review())).toBeNull());
 it("rejects duplicate recipients and incomplete messages",()=>{const r=review(); r.creators.push({...r.creators[0]!}); expect(validateReview(r)).toMatch(/more than once/); r.creators.pop(); r.creators[0]!.body=" "; expect(validateReview(r)).toMatch(/message/);});
});
