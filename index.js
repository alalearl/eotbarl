// node_modules/@google/generative-ai/dist/index.mjs
var getClientHeaders = function() {
  return `${PACKAGE_LOG_HEADER}/${PACKAGE_VERSION}`;
};
async function makeRequest(url, body) {
  let response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-client": getClientHeaders(),
        "x-goog-api-key": url.apiKey
      },
      body
    });
    if (!response.ok) {
      let message = "";
      try {
        const json = await response.json();
        message = json.error.message;
        if (json.error.details) {
          message += ` ${JSON.stringify(json.error.details)}`;
        }
      } catch (e) {
      }
      throw new Error(`[${response.status} ${response.statusText}] ${message}`);
    }
  } catch (e) {
    const err = new GoogleGenerativeAIError(`Error fetching from ${url.toString()}: ${e.message}`);
    err.stack = e.stack;
    throw err;
  }
  return response;
}
var addHelpers = function(response) {
  response.text = () => {
    if (response.candidates && response.candidates.length > 0) {
      if (response.candidates.length > 1) {
        console.warn(`This response had ${response.candidates.length} ` + `candidates. Returning text from the first candidate only. Access response.candidates directly to use the other candidates.`);
      }
      if (hadBadFinishReason(response.candidates[0])) {
        throw new GoogleGenerativeAIResponseError(`${formatBlockErrorMessage(response)}`, response);
      }
      return getText(response);
    } else if (response.promptFeedback) {
      throw new GoogleGenerativeAIResponseError(`Text not available. ${formatBlockErrorMessage(response)}`, response);
    }
    return "";
  };
  return response;
};
var getText = function(response) {
  var _a, _b, _c, _d;
  if ((_d = (_c = (_b = (_a = response.candidates) === null || _a === undefined ? undefined : _a[0].content) === null || _b === undefined ? undefined : _b.parts) === null || _c === undefined ? undefined : _c[0]) === null || _d === undefined ? undefined : _d.text) {
    return response.candidates[0].content.parts[0].text;
  } else {
    return "";
  }
};
var hadBadFinishReason = function(candidate) {
  return !!candidate.finishReason && badFinishReasons.includes(candidate.finishReason);
};
var formatBlockErrorMessage = function(response) {
  var _a, _b, _c;
  let message = "";
  if ((!response.candidates || response.candidates.length === 0) && response.promptFeedback) {
    message += "Response was blocked";
    if ((_a = response.promptFeedback) === null || _a === undefined ? undefined : _a.blockReason) {
      message += ` due to ${response.promptFeedback.blockReason}`;
    }
    if ((_b = response.promptFeedback) === null || _b === undefined ? undefined : _b.blockReasonMessage) {
      message += `: ${response.promptFeedback.blockReasonMessage}`;
    }
  } else if ((_c = response.candidates) === null || _c === undefined ? undefined : _c[0]) {
    const firstCandidate = response.candidates[0];
    if (hadBadFinishReason(firstCandidate)) {
      message += `Candidate was blocked due to ${firstCandidate.finishReason}`;
      if (firstCandidate.finishMessage) {
        message += `: ${firstCandidate.finishMessage}`;
      }
    }
  }
  return message;
};
var __await = function(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
};
var __asyncGenerator = function(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator)
    throw new TypeError("Symbol.asyncIterator is not defined.");
  var g = generator.apply(thisArg, _arguments || []), i, q = [];
  return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i;
  function verb(n) {
    if (g[n])
      i[n] = function(v) {
        return new Promise(function(a, b) {
          q.push([n, v, a, b]) > 1 || resume(n, v);
        });
      };
  }
  function resume(n, v) {
    try {
      step(g[n](v));
    } catch (e) {
      settle(q[0][3], e);
    }
  }
  function step(r) {
    r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f, v) {
    if (f(v), q.shift(), q.length)
      resume(q[0][0], q[0][1]);
  }
};
var processStream = function(response) {
  const inputStream = response.body.pipeThrough(new TextDecoderStream("utf8", { fatal: true }));
  const responseStream = getResponseStream(inputStream);
  const [stream1, stream2] = responseStream.tee();
  return {
    stream: generateResponseSequence(stream1),
    response: getResponsePromise(stream2)
  };
};
async function getResponsePromise(stream) {
  const allResponses = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return addHelpers(aggregateResponses(allResponses));
    }
    allResponses.push(value);
  }
}
var generateResponseSequence = function(stream) {
  return __asyncGenerator(this, arguments, function* generateResponseSequence_1() {
    const reader = stream.getReader();
    while (true) {
      const { value, done } = yield __await(reader.read());
      if (done) {
        break;
      }
      yield yield __await(addHelpers(value));
    }
  });
};
var getResponseStream = function(inputStream) {
  const reader = inputStream.getReader();
  const stream = new ReadableStream({
    start(controller) {
      let currentText = "";
      return pump();
      function pump() {
        return reader.read().then(({ value, done }) => {
          if (done) {
            if (currentText.trim()) {
              controller.error(new GoogleGenerativeAIError("Failed to parse stream"));
              return;
            }
            controller.close();
            return;
          }
          currentText += value;
          let match = currentText.match(responseLineRE);
          let parsedResponse;
          while (match) {
            try {
              parsedResponse = JSON.parse(match[1]);
            } catch (e) {
              controller.error(new GoogleGenerativeAIError(`Error parsing JSON response: "${match[1]}"`));
              return;
            }
            controller.enqueue(parsedResponse);
            currentText = currentText.substring(match[0].length);
            match = currentText.match(responseLineRE);
          }
          return pump();
        });
      }
    }
  });
  return stream;
};
var aggregateResponses = function(responses) {
  const lastResponse = responses[responses.length - 1];
  const aggregatedResponse = {
    promptFeedback: lastResponse === null || lastResponse === undefined ? undefined : lastResponse.promptFeedback
  };
  for (const response of responses) {
    if (response.candidates) {
      for (const candidate of response.candidates) {
        const i = candidate.index;
        if (!aggregatedResponse.candidates) {
          aggregatedResponse.candidates = [];
        }
        if (!aggregatedResponse.candidates[i]) {
          aggregatedResponse.candidates[i] = {
            index: candidate.index
          };
        }
        aggregatedResponse.candidates[i].citationMetadata = candidate.citationMetadata;
        aggregatedResponse.candidates[i].finishReason = candidate.finishReason;
        aggregatedResponse.candidates[i].finishMessage = candidate.finishMessage;
        aggregatedResponse.candidates[i].safetyRatings = candidate.safetyRatings;
        if (candidate.content && candidate.content.parts) {
          if (!aggregatedResponse.candidates[i].content) {
            aggregatedResponse.candidates[i].content = {
              role: candidate.content.role || "user",
              parts: [{ text: "" }]
            };
          }
          for (const part of candidate.content.parts) {
            if (part.text) {
              aggregatedResponse.candidates[i].content.parts[0].text += part.text;
            }
          }
        }
      }
    }
  }
  return aggregatedResponse;
};
async function generateContentStream(apiKey, model, params) {
  const url = new RequestUrl(model, Task.STREAM_GENERATE_CONTENT, apiKey, true);
  const response = await makeRequest(url, JSON.stringify(params));
  return processStream(response);
}
async function generateContent(apiKey, model, params) {
  const url = new RequestUrl(model, Task.GENERATE_CONTENT, apiKey, false);
  const response = await makeRequest(url, JSON.stringify(params));
  const responseJson = await response.json();
  const enhancedResponse = addHelpers(responseJson);
  return {
    response: enhancedResponse
  };
}
var formatNewContent = function(request, role) {
  let newParts = [];
  if (typeof request === "string") {
    newParts = [{ text: request }];
  } else {
    for (const partOrString of request) {
      if (typeof partOrString === "string") {
        newParts.push({ text: partOrString });
      } else {
        newParts.push(partOrString);
      }
    }
  }
  return { role, parts: newParts };
};
var formatGenerateContentInput = function(params) {
  if (params.contents) {
    return params;
  } else {
    const content = formatNewContent(params, "user");
    return { contents: [content] };
  }
};
var formatEmbedContentInput = function(params) {
  if (typeof params === "string" || Array.isArray(params)) {
    const content = formatNewContent(params, "user");
    return { content };
  }
  return params;
};
async function countTokens(apiKey, model, params) {
  const url = new RequestUrl(model, Task.COUNT_TOKENS, apiKey, false);
  const response = await makeRequest(url, JSON.stringify(Object.assign(Object.assign({}, params), { model })));
  return response.json();
}
async function embedContent(apiKey, model, params) {
  const url = new RequestUrl(model, Task.EMBED_CONTENT, apiKey, false);
  const response = await makeRequest(url, JSON.stringify(params));
  return response.json();
}
async function batchEmbedContents(apiKey, model, params) {
  const url = new RequestUrl(model, Task.BATCH_EMBED_CONTENTS, apiKey, false);
  const requestsWithModel = params.requests.map((request) => {
    return Object.assign(Object.assign({}, request), { model: `models/${model}` });
  });
  const response = await makeRequest(url, JSON.stringify({ requests: requestsWithModel }));
  return response.json();
}
var HarmCategory;
(function(HarmCategory2) {
  HarmCategory2["HARM_CATEGORY_UNSPECIFIED"] = "HARM_CATEGORY_UNSPECIFIED";
  HarmCategory2["HARM_CATEGORY_HATE_SPEECH"] = "HARM_CATEGORY_HATE_SPEECH";
  HarmCategory2["HARM_CATEGORY_SEXUALLY_EXPLICIT"] = "HARM_CATEGORY_SEXUALLY_EXPLICIT";
  HarmCategory2["HARM_CATEGORY_HARASSMENT"] = "HARM_CATEGORY_HARASSMENT";
  HarmCategory2["HARM_CATEGORY_DANGEROUS_CONTENT"] = "HARM_CATEGORY_DANGEROUS_CONTENT";
})(HarmCategory || (HarmCategory = {}));
var HarmBlockThreshold;
(function(HarmBlockThreshold2) {
  HarmBlockThreshold2["HARM_BLOCK_THRESHOLD_UNSPECIFIED"] = "HARM_BLOCK_THRESHOLD_UNSPECIFIED";
  HarmBlockThreshold2["BLOCK_LOW_AND_ABOVE"] = "BLOCK_LOW_AND_ABOVE";
  HarmBlockThreshold2["BLOCK_MEDIUM_AND_ABOVE"] = "BLOCK_MEDIUM_AND_ABOVE";
  HarmBlockThreshold2["BLOCK_ONLY_HIGH"] = "BLOCK_ONLY_HIGH";
  HarmBlockThreshold2["BLOCK_NONE"] = "BLOCK_NONE";
})(HarmBlockThreshold || (HarmBlockThreshold = {}));
var HarmProbability;
(function(HarmProbability2) {
  HarmProbability2["HARM_PROBABILITY_UNSPECIFIED"] = "HARM_PROBABILITY_UNSPECIFIED";
  HarmProbability2["NEGLIGIBLE"] = "NEGLIGIBLE";
  HarmProbability2["LOW"] = "LOW";
  HarmProbability2["MEDIUM"] = "MEDIUM";
  HarmProbability2["HIGH"] = "HIGH";
})(HarmProbability || (HarmProbability = {}));
var BlockReason;
(function(BlockReason2) {
  BlockReason2["BLOCKED_REASON_UNSPECIFIED"] = "BLOCKED_REASON_UNSPECIFIED";
  BlockReason2["SAFETY"] = "SAFETY";
  BlockReason2["OTHER"] = "OTHER";
})(BlockReason || (BlockReason = {}));
var FinishReason;
(function(FinishReason2) {
  FinishReason2["FINISH_REASON_UNSPECIFIED"] = "FINISH_REASON_UNSPECIFIED";
  FinishReason2["STOP"] = "STOP";
  FinishReason2["MAX_TOKENS"] = "MAX_TOKENS";
  FinishReason2["SAFETY"] = "SAFETY";
  FinishReason2["RECITATION"] = "RECITATION";
  FinishReason2["OTHER"] = "OTHER";
})(FinishReason || (FinishReason = {}));
var TaskType;
(function(TaskType2) {
  TaskType2["TASK_TYPE_UNSPECIFIED"] = "TASK_TYPE_UNSPECIFIED";
  TaskType2["RETRIEVAL_QUERY"] = "RETRIEVAL_QUERY";
  TaskType2["RETRIEVAL_DOCUMENT"] = "RETRIEVAL_DOCUMENT";
  TaskType2["SEMANTIC_SIMILARITY"] = "SEMANTIC_SIMILARITY";
  TaskType2["CLASSIFICATION"] = "CLASSIFICATION";
  TaskType2["CLUSTERING"] = "CLUSTERING";
})(TaskType || (TaskType = {}));

class GoogleGenerativeAIError extends Error {
  constructor(message) {
    super(`[GoogleGenerativeAI Error]: ${message}`);
  }
}

class GoogleGenerativeAIResponseError extends GoogleGenerativeAIError {
  constructor(message, response) {
    super(message);
    this.response = response;
  }
}
var BASE_URL = "https://generativelanguage.googleapis.com";
var API_VERSION = "v1";
var PACKAGE_VERSION = "0.1.3";
var PACKAGE_LOG_HEADER = "genai-js";
var Task;
(function(Task2) {
  Task2["GENERATE_CONTENT"] = "generateContent";
  Task2["STREAM_GENERATE_CONTENT"] = "streamGenerateContent";
  Task2["COUNT_TOKENS"] = "countTokens";
  Task2["EMBED_CONTENT"] = "embedContent";
  Task2["BATCH_EMBED_CONTENTS"] = "batchEmbedContents";
})(Task || (Task = {}));

class RequestUrl {
  constructor(model, task, apiKey, stream) {
    this.model = model;
    this.task = task;
    this.apiKey = apiKey;
    this.stream = stream;
  }
  toString() {
    let url = `${BASE_URL}/${API_VERSION}/models/${this.model}:${this.task}`;
    if (this.stream) {
      url += "?alt=sse";
    }
    return url;
  }
}
var badFinishReasons = [FinishReason.RECITATION, FinishReason.SAFETY];
var responseLineRE = /^data\: (.*)(?:\n\n|\r\r|\r\n\r\n)/;
var SILENT_ERROR = "SILENT_ERROR";

class ChatSession {
  constructor(apiKey, model, params) {
    this.model = model;
    this.params = params;
    this._history = [];
    this._sendPromise = Promise.resolve();
    this._apiKey = apiKey;
    if (params === null || params === undefined ? undefined : params.history) {
      this._history = params.history.map((content) => {
        if (!content.role) {
          throw new Error("Missing role for history item: " + JSON.stringify(content));
        }
        return formatNewContent(content.parts, content.role);
      });
    }
  }
  async getHistory() {
    await this._sendPromise;
    return this._history;
  }
  async sendMessage(request) {
    var _a, _b;
    await this._sendPromise;
    const newContent = formatNewContent(request, "user");
    const generateContentRequest = {
      safetySettings: (_a = this.params) === null || _a === undefined ? undefined : _a.safetySettings,
      generationConfig: (_b = this.params) === null || _b === undefined ? undefined : _b.generationConfig,
      contents: [...this._history, newContent]
    };
    let finalResult;
    this._sendPromise = this._sendPromise.then(() => generateContent(this._apiKey, this.model, generateContentRequest)).then((result) => {
      var _a2;
      if (result.response.candidates && result.response.candidates.length > 0) {
        this._history.push(newContent);
        const responseContent = Object.assign({
          parts: [],
          role: "model"
        }, (_a2 = result.response.candidates) === null || _a2 === undefined ? undefined : _a2[0].content);
        this._history.push(responseContent);
      } else {
        const blockErrorMessage = formatBlockErrorMessage(result.response);
        if (blockErrorMessage) {
          console.warn(`sendMessage() was unsuccessful. ${blockErrorMessage}. Inspect response object for details.`);
        }
      }
      finalResult = result;
    });
    await this._sendPromise;
    return finalResult;
  }
  async sendMessageStream(request) {
    var _a, _b;
    await this._sendPromise;
    const newContent = formatNewContent(request, "user");
    const generateContentRequest = {
      safetySettings: (_a = this.params) === null || _a === undefined ? undefined : _a.safetySettings,
      generationConfig: (_b = this.params) === null || _b === undefined ? undefined : _b.generationConfig,
      contents: [...this._history, newContent]
    };
    const streamPromise = generateContentStream(this._apiKey, this.model, generateContentRequest);
    this._sendPromise = this._sendPromise.then(() => streamPromise).catch((_ignored) => {
      throw new Error(SILENT_ERROR);
    }).then((streamResult) => streamResult.response).then((response) => {
      if (response.candidates && response.candidates.length > 0) {
        this._history.push(newContent);
        const responseContent = Object.assign({}, response.candidates[0].content);
        if (!responseContent.role) {
          responseContent.role = "model";
        }
        this._history.push(responseContent);
      } else {
        const blockErrorMessage = formatBlockErrorMessage(response);
        if (blockErrorMessage) {
          console.warn(`sendMessageStream() was unsuccessful. ${blockErrorMessage}. Inspect response object for details.`);
        }
      }
    }).catch((e) => {
      if (e.message !== SILENT_ERROR) {
        console.error(e);
      }
    });
    return streamPromise;
  }
}

class GenerativeModel {
  constructor(apiKey, modelParams) {
    var _a;
    this.apiKey = apiKey;
    if (modelParams.model.startsWith("models/")) {
      this.model = (_a = modelParams.model.split("models/")) === null || _a === undefined ? undefined : _a[1];
    } else {
      this.model = modelParams.model;
    }
    this.generationConfig = modelParams.generationConfig || {};
    this.safetySettings = modelParams.safetySettings || [];
  }
  async generateContent(request) {
    const formattedParams = formatGenerateContentInput(request);
    return generateContent(this.apiKey, this.model, Object.assign({ generationConfig: this.generationConfig, safetySettings: this.safetySettings }, formattedParams));
  }
  async generateContentStream(request) {
    const formattedParams = formatGenerateContentInput(request);
    return generateContentStream(this.apiKey, this.model, Object.assign({ generationConfig: this.generationConfig, safetySettings: this.safetySettings }, formattedParams));
  }
  startChat(startChatParams) {
    return new ChatSession(this.apiKey, this.model, startChatParams);
  }
  async countTokens(request) {
    const formattedParams = formatGenerateContentInput(request);
    return countTokens(this.apiKey, this.model, formattedParams);
  }
  async embedContent(request) {
    const formattedParams = formatEmbedContentInput(request);
    return embedContent(this.apiKey, this.model, formattedParams);
  }
  async batchEmbedContents(batchEmbedContentRequest) {
    return batchEmbedContents(this.apiKey, this.model, batchEmbedContentRequest);
  }
}

class GoogleGenerativeAI {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  getGenerativeModel(modelParams) {
    if (!modelParams.model) {
      throw new GoogleGenerativeAIError(`Must provide a model name. Example: genai.getGenerativeModel({ model: 'my-model-name' })`);
    }
    return new GenerativeModel(this.apiKey, modelParams);
  }
}

// index.ts
var PORT = process.env.PORT || 3000;
var TOKEN = process.env.LINE_ACCESS_TOKEN;
var handleWebhook = async (req) => {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  if (req.body.events[0].type === "message") {
    const message = req.body.events[0].message.text;
    const result = await model.generateContent(message);
    const geResponse = await result.response;
    const text = geResponse.text();
    const messages = text.split("\n").map((item) => ({
      type: "text",
      text: item
    }));
    const dataString = JSON.stringify({
      replyToken: req.body.events[0].replyToken,
      messages
    });
    const headers = {
      "Content-Type": "application/json",
      Authorization: "Bearer " + TOKEN
    };
    const webhookOptions = {
      hostname: "api.line.me",
      path: "/v2/bot/message/reply",
      method: "POST",
      headers,
      body: dataString
    };
    const response = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      body: dataString,
      headers
    });
  }
  return new Response(JSON.stringify(req), {
    headers: { "Content-Type": "application/json" },
    status: 200
  });
};
Bun.serve({
  port: PORT,
  async fetch(request) {
    const { method } = request;
    const { pathname } = new URL(request.url);
    if (method === "POST" && pathname === "/webhook") {
      const req = await request.json();
      return handleWebhook(req);
    }
    return new Response("Not Found", { status: 404 });
  }
});
console.log(`Listening on http://localhost:${PORT} ...`);
