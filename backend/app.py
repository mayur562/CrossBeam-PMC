import os
import time
import json
import base64
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

from google import genai
from google.genai import types

load_dotenv(dotenv_path="../.env.local")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_MODEL = 'gemini-3.5-flash-lite'

def get_ai_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY is not configured.")
    return genai.Client(api_key=api_key)

def generate_content_with_retry(client: genai.Client, model: str, contents: Any, config: types.GenerateContentConfig, max_retries: int = 2, delay_ms: int = 2000):
    attempt = 0
    while attempt <= max_retries:
        try:
            return client.models.generate_content(
                model=model,
                contents=contents,
                config=config
            )
        except Exception as e:
            is_503 = False
            if hasattr(e, 'status_code') and e.status_code == 503:
                is_503 = True
            elif '503' in str(e):
                is_503 = True

            if is_503 and attempt < max_retries:
                attempt += 1
                print(f"Gemini API 503 error. Retrying attempt {attempt}...")
                time.sleep(delay_ms / 1000.0)
            else:
                if is_503:
                    print("Gemini API 503 error. Retries exhausted.")
                    raise HTTPException(status_code=503, detail="Service Unavailable (High Demand)")
                raise HTTPException(status_code=500, detail=str(e))

# Models
class DocumentCheckRequest(BaseModel):
    documentBase64: str
    mimeType: str
    documentTitle: str

class PlotExtractRequest(BaseModel):
    description: str

class ReadBlueprintRequest(BaseModel):
    documentBase64: str
    mimeType: str

class ExplainResultRequest(BaseModel):
    inputs: Dict[str, Any]
    fieldName: str
    fieldValue: Any
    language: str = 'English'

class GenerateSummaryRequest(BaseModel):
    inputs: Dict[str, Any]
    results: Dict[str, Any]
    language: str = 'English'

class ExplainRejectionRequest(BaseModel):
    remarksText: str
    language: str = 'English'

# Response Schemas for AI Output
class CheckDocumentResponse(BaseModel):
    status: str = Field(description="present_looks_complete, needs_verification, or not_detected")
    reason: str = Field(description="A brief 1 sentence explanation of why this status was chosen.")

class BlueprintResponse(BaseModel):
    plot_area_sqm: Optional[float]
    road_width_m: Optional[float]
    front_setback_m: Optional[float]
    side_setback_m: Optional[float]
    rear_setback_m: Optional[float]
    building_height_m: Optional[float]

class PlotExtractResponse(BaseModel):
    plot_area_sqm: Optional[float]
    road_width_m: Optional[float]
    tenement_area_sqm: Optional[float]
    zone: Optional[str] = Field(description="residential or commercial")
    congestion_status: Optional[str] = Field(description="congested or non-congested")

class RejectionRemark(BaseModel):
    original_text: str = Field(description="The exact original text of the distinct remark from the PMC letter.")
    plain_meaning: str = Field(description="A plain-language explanation of what this remark means.")
    related_regulation: str = Field(description="The related DCPR-2017 regulation name or number, or 'unclear' if it cannot be mapped or is outside the scope of typical dimensional rules.")
    next_step: str = Field(description="A general recommendation on what the homeowner should do next to address this remark.")

# Endpoints
@app.post("/api/check-document")
async def check_document(req: DocumentCheckRequest):
    client = get_ai_client()
    system_instruction = """You are a document verification assistant.
Your job is to read the provided document and determine if it appears to be the document requested ("{0}").
You MUST return a structured status.
Do NOT give a hard legal validity. Just check if it looks correct, present, and complete (has expected signatures/stamps if typical for such documents).
Return exactly one of these statuses:
- present_looks_complete
- needs_verification (use this if it looks like the right document but is blurry, missing pages, or missing expected stamps/signatures)
- not_detected (use this if it's the wrong document entirely, e.g. a photo of a cat or a different form)""".format(req.documentTitle)

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json",
        response_schema=CheckDocumentResponse
    )

    image_bytes = base64.b64decode(req.documentBase64)
    contents = [
        types.Part.from_bytes(data=image_bytes, mime_type=req.mimeType),
        f"Is this a {req.documentTitle}?"
    ]

    response = generate_content_with_retry(client, GEMINI_MODEL, contents, config)
    return json.loads(response.text)

@app.post("/api/read-blueprint")
async def read_blueprint(req: ReadBlueprintRequest):
    client = get_ai_client()
    system_instruction = """You are an architectural blueprint reader.
Your job is to read the provided site plan or blueprint image and extract the DIMENSION LABELS that are already written on the drawing.
Explicit instructions:
- ONLY extract text/numeric labels visibly written on the image. 
- DO NOT estimate or infer a dimension from the drawing's proportions or scale if it isn't explicitly labeled with a number.
- If a value is not explicitly labeled on the drawing, return null for that field.

Extract the following values (as numbers):
- plot_area_sqm
- road_width_m
- front_setback_m
- side_setback_m
- rear_setback_m
- building_height_m

If the dimensions are in feet or other units, try to convert them to meters (or square meters for area) if you are absolutely sure of the label, but do not guess the label itself."""

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json",
        response_schema=BlueprintResponse
    )

    image_bytes = base64.b64decode(req.documentBase64)
    contents = [
        types.Part.from_bytes(data=image_bytes, mime_type=req.mimeType),
        "Extract the dimension labels from this blueprint."
    ]

    response = generate_content_with_retry(client, GEMINI_MODEL, contents, config)
    return json.loads(response.text)

@app.post("/api/extract-plot")
async def extract_plot(req: PlotExtractRequest):
    client = get_ai_client()
    system_instruction = """Extract plot parameters from the user's description.
If a field is not mentioned or ambiguous, return null for that field. Do NOT guess.
- plot_area_sqm (number)
- road_width_m (number)
- tenement_area_sqm (number)
- zone: Must be exactly "residential" or "commercial"
- congestion_status: Must be exactly "congested" or "non-congested" """

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json",
        response_schema=PlotExtractResponse
    )

    response = generate_content_with_retry(client, GEMINI_MODEL, req.description, config)
    return json.loads(response.text)

@app.post("/api/explain-result")
async def explain_result(req: ExplainResultRequest):
    client = get_ai_client()
    system_instruction = f"""You are an expert on Pune's DCPR-2017 building regulations.
The user is viewing a calculation result for their plot.
Your ONLY job is to explain WHY this specific number applies, based on the provided inputs.
Do NOT question the number, do NOT recalculate it, and do NOT give legal advice.
Explain it in plain, simple language in 2-3 sentences. Mention the relevant inputs (e.g. "Because your plot is on a 9m road...").
CRITICAL: You MUST write your explanation in {req.language}. Do not use English unless the requested language is English."""

    description = f"""Inputs:
Plot Area: {req.inputs.get('plotArea')} sq m
Road Width: {req.inputs.get('roadWidth')} m
Zone: {req.inputs.get('zone')}
Congestion Status: {req.inputs.get('congestion')}
Tenement Area: {req.inputs.get('tenementArea')} sq m

Result to explain:
Field: {req.fieldName}
Value: {req.fieldValue}"""

    config = types.GenerateContentConfig(
        system_instruction=system_instruction
    )

    response = generate_content_with_retry(client, GEMINI_MODEL, description, config)
    return {"explanation": response.text}

@app.post("/api/generate-summary")
async def generate_summary(req: GenerateSummaryRequest):
    client = get_ai_client()
    system_instruction = f"""You are an expert on Pune's DCPR-2017 building regulations.
The user needs a one-page, homeowner-friendly plain-text summary of their plot's compliance pre-check.

CRITICAL RULES:
1. You MUST include EVERY number exactly as given in the provided inputs and results.
2. NEVER recalculate, round differently, estimate, or add values not provided.
3. Structure the summary with clear headings (e.g., Plot Details, Required Setbacks, FSI & Height, Parking Requirements).
4. End the summary with a disclaimer stating that this is an informal pre-check and not an official PMC confirmation.
5. You MUST write the entire summary in {req.language}. If the language is Marathi or Hindi, translate the prose and headings, but ensure the numbers remain accurate.

Provided Data:
Inputs:
- Plot Area: {req.inputs.get('plotArea')} sq m
- Road Width: {req.inputs.get('roadWidth')} m
- Tenement Area: {req.inputs.get('tenementArea')} sq m
- Zone: {req.inputs.get('zone')}
- Area Type: {req.inputs.get('congestion')}

Results:
{json.dumps(req.results, indent=2)}"""

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        temperature=0.1
    )

    response = generate_content_with_retry(client, GEMINI_MODEL, "Please generate the summary based on the provided data.", config)
    return {"summaryText": response.text}

@app.post("/api/explain-rejection")
async def explain_rejection(req: ExplainRejectionRequest):
    if not req.remarksText or not req.remarksText.strip():
        raise HTTPException(status_code=400, detail="Missing or empty remarks text.")

    client = get_ai_client()
    system_instruction = f"""You are a helpful assistant for homeowners deciphering PMC (Pune Municipal Corporation) building permission rejection letters or query remarks.
Your goal is to parse the pasted text, identify distinct remarks, and explain what they mean in simple plain language.

CRITICAL RULES:
1. Identify distinct remarks within the pasted text. There may be one or multiple.
2. For each remark, provide a plain-language meaning. You MUST write this in {req.language}.
3. Attempt to map the remark to a known DCPR-2017 regulation (e.g., "17.2.1", "Table No. 6", "Setback", "FSI", "Parking"). If it's ambiguous or outside typical structural/zoning rules (e.g., fire NOC, structural stability), output EXACTLY "unclear" (in English, do not translate this word).
4. Provide a general next step (e.g., "Check the Front Margin in the Calculator tab", or "Consult your architect about fire safety"). You MUST write this in {req.language}.
5. NEVER invent, calculate, or confirm compliance numbers. Do NOT say "You need a 1.5m setback." Instead, say "You must ensure your setback meets the minimum requirement for your road width. Please check the calculator or consult your architect." (Translated into {req.language}).
6. If the entire text is not a building permission remark, return a single item indicating it's unrecognized (in {req.language}).
7. The JSON keys and the exact string "unclear" for related_regulation must always remain in English to not break frontend parsing."""

    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json",
        response_schema=list[RejectionRemark]
    )

    contents = [f'Please explain the following PMC remarks:\n\n"{req.remarksText}"']
    response = generate_content_with_retry(client, GEMINI_MODEL, contents, config)
    
    return {"remarks": json.loads(response.text)}
