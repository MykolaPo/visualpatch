export type ElementType =
  | 'raster'
  | 'text'
  | 'rect'
  | 'button'
  | 'image'
  | 'container'
  | 'group';

export type BgRestoreMode = 'sample' | 'solid' | 'ai';

export type ToolType =
  | 'select'
  | 'hand'
  | 'crop'
  | 'text'
  | 'rect'
  | 'image'
  | 'comment';

export type CompareMode = 'after' | 'before' | 'split';

export type OperationType =
  | 'MOVE'
  | 'RESIZE'
  | 'CREATE'
  | 'DELETE'
  | 'HIDE'
  | 'DUPLICATE'
  | 'GROUP'
  | 'UNGROUP'
  | 'EDIT_TEXT'
  | 'CHANGE_STYLE'
  | 'CHANGE_ORDER'
  | 'ADD_COMMENT';

export interface SourceCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementStyles {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  borderRadius?: number;
  opacity?: number;
  align?: 'left' | 'center' | 'right';
}

export interface VisualElement {
  id: string;
  projectId: string;
  parentId: string | null;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  content?: string;
  imageDataUrl?: string;
  styles: ElementStyles;
  sourceCrop?: SourceCrop;
  bgRestoreMode?: BgRestoreMode;
  bgRestoreColor?: string;
  bgRestoreDataUrl?: string;
  deleted?: boolean;
  confidence?: number;
  semanticRole?: string;
  domMetadata?: Record<string, string>;
}

export interface Operation {
  id: string;
  projectId: string;
  elementId: string;
  elementName?: string;
  type: OperationType;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  timestamp: string;
}

export interface CommentItem {
  id: string;
  projectId: string;
  elementId: string | null;
  x: number;
  y: number;
  text: string;
  status: 'open' | 'resolved';
  priority?: 'low' | 'medium' | 'high';
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  sourceUrl: string;
  sourceImage: string;
  canvasWidth: number;
  canvasHeight: number;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
}

export interface ProjectSnapshot {
  project: Project;
  elements: VisualElement[];
  operations: Operation[];
  comments: CommentItem[];
}

export interface DetectedRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  suggestedType: ElementType;
  suggestedName: string;
}

export interface ControlRoomConfig {
  endpoint: string;
  targetProject: string;
  assignee: string;
  apiToken: string;
}

export interface AIProviderConfig {
  mode: 'local' | 'ollama' | 'openai';
  endpoint: string;
  model: string;
  apiKey: string;
}
