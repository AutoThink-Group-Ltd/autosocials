import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  navigate:vi.fn(), get: vi.fn(), save: vi.fn(), estimate: vi.fn(), quote: vi.fn(), produce: vi.fn(), status: vi.fn()
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => api.navigate }));
vi.mock("@/workspace/WorkspaceUi", () => ({useWorkspaceUi: () => ({setMobileView:vi.fn()})}));
vi.mock("@/features/create/ProductionProgress", () => ({ProductionProgress: ({onBack}: {onBack: () => void}) => <button onClick={onBack}>Back to plan</button>}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/content-campaign.functions", () => ({ getContentCampaign: api.get, saveContentCampaign: api.save }));
vi.mock("@/lib/personal-idea-batch.functions", () => ({ estimateContentCampaign: api.estimate, quoteContentCampaignProduction: api.quote, produceContentCampaign: api.produce, getContentCampaignProduction: api.status }));
vi.mock("@/features/create/CampaignFormatHandoff", () => ({ CampaignFormatHandoff: () => null }));
vi.mock("@/features/schedule/CampaignScheduleReview", () => ({ CampaignScheduleReview: ({rows}: {rows: unknown[]}) => <p>{rows.length} scheduling rows</p> }));
import { CampaignCard } from "./CampaignCard";

it("shows the complete plan and price before one approval and sends only completed assets to scheduling", async () => {
  const posts = Array.from({length:12}, (_, i) => ({id: String(i), title: "Post " + i, platform: "linkedin", format:"tiles", caption: "Caption " + i, date: "2026-11-" + (i+19), brief:"Design"}));
  api.get.mockResolvedValue({id:"campaign",revision:"version",title:"November",timezone:"Europe/London",contextUsed:["Your goals"],posts});
  api.estimate.mockResolvedValue({totalCredits:48, quoteId:null});
  api.quote.mockResolvedValue({totalCredits:48, quoteId:"quote", batch_id:"batch"});
  const first = {postId:"0",type:"tile",assetId:"asset",status:"ready",date:posts[0]!.date,platform:"linkedin",caption:"Caption 0"};
  const done = {status:"submitted",results:[first,{...first,assetId:null,status:"failed"}]};
  api.status.mockResolvedValue(done);
  api.produce.mockResolvedValue(done);
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><CampaignCard workspaceId="workspace" campaignId="campaign" /></QueryClientProvider>);
  await screen.findByText("48 credits for 12 posts");
  expect(screen.getByText(/2026-11-30 · Post 11/)).toBeTruthy();
  expect(api.produce).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Approve & produce"}));
  expect(api.navigate).toHaveBeenCalledWith({to:"/app/create",search:{production:"campaign",group:0}});
  await waitFor(() => expect(api.produce).toHaveBeenCalledWith({data:{workspace_id:"workspace",campaign_id:"campaign",revision:"version",offset:0,batch_id:"batch",quote_id:"quote",confirmed:true}}));
  expect(await screen.findByText("1 scheduling rows")).toBeTruthy();
});

it("returns from production to the exact campaign plan", async () => {
  api.navigate.mockClear();
  api.get.mockResolvedValue({id:"campaign",revision:"version",title:"November",timezone:"Europe/London",contextUsed:[],posts:[{id:"post",title:"Post",platform:"linkedin",format:"written",caption:"Caption",date:"2026-11-19",brief:""}]});
  api.estimate.mockResolvedValue({totalCredits:0, quoteId:null});
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><CampaignCard workspaceId="workspace" campaignId="campaign" previewGroup={0} /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", {name:"Back to plan"}));
  expect(api.navigate).toHaveBeenCalledWith({to:"/app/create",search:{stage:"plans",item:"campaign:campaign"}});
});

it("shows reviewed tile direction and its verified quotation source", async () => {
  api.get.mockResolvedValue({id:"campaign",revision:"version",title:"November",timezone:"Europe/London",contextUsed:[],posts:[{id:"post",title:"A lesson",platform:"linkedin",format:"tiles",caption:"A practical idea",date:"2026-11-19",brief:"Ink and paper", design:{aspect:"portrait",treatment:"typography",composition:"full",medium:"Ink and paper",accent:"#112233",emphasis:"",typeface:"serif"}, quote:{text:"A verified quotation",speaker:"Author",sourceTitle:"Original speech",sourceUrl:"https://example.com/speech"}}]});
  api.estimate.mockResolvedValue({totalCredits:0, quoteId:null});
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  render(<QueryClientProvider client={client}><CampaignCard workspaceId="workspace" campaignId="campaign" /></QueryClientProvider>);
  expect(await screen.findByText(/Proposed design: typography/)).toBeInTheDocument();
  expect(screen.getByRole("link", {name:"Original speech"})).toHaveAttribute("href", "https://example.com/speech");
});
