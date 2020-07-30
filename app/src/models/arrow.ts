import _ from "lodash";
import * as G from "@/models/draggable";
import * as U from "@/util";
import { SetupContext, computed } from '@vue/composition-api';

// [Arrow]
// リンク(Link)の具体的な表示を決めるもの


export const arrowTypes = ["direct", "parallel"] as const;
type ArrowType = typeof arrowTypes[number];

type ArrowBase = {
  id: string;
  /**
   * 始点となるノード
   */
  from_id: string;
  /**
   * 終点となるノード
   */
  to_id: string;

  type: ArrowType;
}

type StrokeAttr = {
  stroke?: string;
  stroke_width?: number;
  stroke_dasharray?: string;
  stroke_opacity?: number;
};

type ArrowHead = {
  angle?: number; // in radian
  legth?: number;
  position?: number; // 0 - 1
} & StrokeAttr;

/**
 * fromとtoを結ぶ直線の矢
 */
export type DirectArrow = ArrowBase & {
  type: "direct";
  shaft: StrokeAttr;
  head: ArrowHead;
}

/**
 * fromとtoを座標軸に平行 or 垂直な折れ線で結ぶ
 */
export type ParallelArrow = ArrowBase & {
  type: "parallel";
  shaft: StrokeAttr;
  head: ArrowHead;
}

export type ArrowData = DirectArrow | ParallelArrow;

export type ArrowStatus<T extends ArrowData> = {
  name?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} & T;

/**
 * 汎用マウスイベント ハンドラ
 */
export const handlers = (prop: {
  arrow_id?: string;
}, context: SetupContext) => {
  return {
    mouseDown(event: MouseEvent) {
      const arrow_id = prop.arrow_id;
      if (!arrow_id) { return; }
      context.emit("arrowMouseDown", { event, arrow_id });
    },
    mouseEnter(event: MouseEvent) {
      const arrow_id = prop.arrow_id;
      if (!arrow_id) { return; }
      context.emit("arrowMouseEnter", { event, arrow_id });
    },

    mouseLeave(event: MouseEvent) {
      const arrow_id = prop.arrow_id;
      if (!arrow_id) { return; }
      context.emit("arrowMouseLeave", { event, arrow_id });
    },
  };
};

export function svg_attr_binder(status: any) {
  return _(status).pick("stroke", "stroke_width", "stroke_opacity", "stroke_dasharray").mapKeys((v,key) => key.replace(/_/g, "-")).value();
}

const defaults = {
  arrowLength: 12,
  arrorHeadAngle: 30,
};

export function useArrowHead(prop: {
  status: ArrowStatus<ArrowData>;
}) {
  return {
    /**
     * 鏃の開き角
     */
    arrowhead_angle: computed(() => {
      const status = prop.status;
      return (_.isFinite(status.head.angle) ? status.head.angle! : defaults.arrorHeadAngle) * Math.PI / 180;
    }),
    /**
     * 鏃の長さ
     */
    arrowhead_length: computed(() => {
      const status = prop.status;
      return _.isFinite(status.head.legth) ? status.head.legth! : defaults.arrowLength;
    }),
    /**
     * 鏃が矢本体のどの位置から出るか(0-1)
     */
    arrow_headposition: computed(() => {
      const status = prop.status;
      return _.isFinite(status.head.position) ? status.head.position! : 1;
    }),
  };
}
