import * as _ from "lodash";
import moment from "moment";
import "moment-timezone"
moment.tz.setDefault("Asia/Tokyo");
import { reactive, ref, Ref, SetupContext, defineComponent, onMounted, PropType, watch } from '@vue/composition-api';

/**
 * template で使うためのフォーマット関数群
 */
export const useFormatter = () => {
  return {
    /**
     * epoch を moment.format() を使ってフォーマットする
     */
    format_epoch(epoch_ms: number, format: string) {
      return moment(epoch_ms).format(format);
    },

    format_svg_text_multiline(text: string) {
      return text.split(/\n/);
    }
  };
};