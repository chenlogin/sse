<template>
  <div class="chat-wrapper">
    <div class="chat-icon" @click="expandChat = !expandChat"></div>
    <div v-show="expandChat" class="chat-dialog-box">
      <div class="chat-dialog-box-header">
        <div class="header-icon"><em class="header-icon-bg"></em>AI助手</div>
        <div class="header-close" @click="closeChat">
          <el-icon><Close /></el-icon>
        </div>
      </div>
      <div class="chat-dialog-box-content" :class="{ 'content-expanded': !hasQuestionList }">
        <div class="chat-dialog-box-content-qa">
          <div
            v-for="(message, index) in messages"
            :key="index"
            class="chat-dialog-box-content-qa-item"
            :class="message.type"
          >
            <div class="message-content" v-html="message.content"></div>
          </div>
        </div>
      </div>
      <div class="question-list">
        <div v-if="summaryInfo.length > 0" class="question-list-item" @click="clickSummary">
          <span>汇总报告</span>
        </div>
        <div
          v-if="areaComparisonInfo.length > 0"
          class="question-list-item"
          @click="clickAreaComparison"
        >
          <span>区域对比</span>
        </div>
      </div>
      <div class="chat-dialog-box-footer">
        <div class="footer-input">
          <div ref="editor" class="editor-host"></div>
        </div>
        <div class="footer-send">
          <el-button type="primary" @click="sendMessage" :disabled="isLoading"> 发送 </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import { aichat, getPortraitDetailByType } from '../api/ai-chat'
import Editor from 'text-editor'

interface Message {
  type: 'person' | 'robot'
  content: string
}
const emit = defineEmits<{
  showDetail: [node: any]
}>()
const expandChat = ref(true)
const isLoading = ref(false)
const summaryInfo = ref<any>([])
const areaComparisonInfo = ref<any>([])
const aiHistory = ref<{ content: string; is_user: boolean }[]>([])
const placeholderText = ref('')
const messages = ref<Message[]>([
  {
    type: 'robot',
    content: `<div class="welcome">
        <div class="robot-welcome">HI，我是您的教学助手~</div>
        <div class="robot-welcome-content">关于画像和教学问题都可以问我哦，我会尽力帮您解答</div>
      </div>`,
  },
])

// 计算 question-list 是否显示
const hasQuestionList = computed(() => {
  return summaryInfo.value.length > 0 || areaComparisonInfo.value.length > 0
})

const props = defineProps({
  type: {
    type: String,
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  grade_stage_subject_id: {
    type: Number,
    required: true,
  },
  id: {
    type: Number,
    required: true,
  },
  query_type: {
    type: Number,
    required: true,
  },
  graph_book_id: {
    type: Number,
    required: true,
  },
  time_range_id: {
    type: Number,
    required: true,
  },
})

const editor = ref()
let editorInstance: any
const setContent = (msg: string) => {
  const div = document.createElement('div')
  div.innerHTML = msg
  editorInstance.setContent(msg)
  editorInstance.quill.history.clear()
}
const getContent = () => {
  const html = editorInstance.getContent(true)
  const div = document.createElement('div')
  div.innerHTML = html

  const container = div.children[0]
  if (
    container.children.length === 1 &&
    container.children[0].children[0] &&
    container.children[0].children[0].classList.contains('paragraph-mark')
  ) {
    return ''
  }
  return container.innerHTML || ''
}
// 打字机效果函数
const typewriterEffect = async (
  text: string,
  messageIndex: number,
  richText: string = '',
  speed: number = 50,
) => {
  const message = messages.value[messageIndex]
  message.content = ''

  for (let i = 0; i <= text.length; i++) {
    message.content = text.slice(0, i)
    await new Promise((resolve) => setTimeout(resolve, speed))
  }
  if (richText) {
    message.content += richText
  }
}

// 发送消息
const sendMessage = async () => {
  const content = getContent()
  if (!content.trim() || isLoading.value) return

  const userMessage = content.trim()
  setContent('')

  // 添加用户消息
  messages.value.push({
    type: 'person',
    content: userMessage,
  })

  isLoading.value = true

  // 添加机器人"思考中"消息
  messages.value.push({
    type: 'robot',
    content:
      '<div class="thinking-indicator"><span class="thinking-text">我在分析中，别着急哦</span><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>',
  })

  // 滚动到底部
  await nextTick()
  scrollToBottom()

  try {
    aiHistory.value.push({
      content: userMessage,
      is_user: true,
    })
    const response = await aichat(aiHistory.value, placeholderText.value, props.type)
    if (response.errNo === 0 && response.data) {
      messages.value.pop() // 移除思考中消息
      const robotMessageIndex = messages.value.length
      messages.value.push({
        type: 'robot',
        content: '',
      })
      aiHistory.value.push({
        content: response.data.content,
        is_user: false,
      })
      // 滚动到底部
      await nextTick()
      scrollToBottom()

      // 开始打字机效果
      await typewriterEffect(response.data.content, robotMessageIndex)
    } else {
      messages.value.pop() // 移除思考中消息
      messages.value.push({
        type: 'robot',
        content: '抱歉，我暂时无法回答您的问题，请稍后再试。',
      })
    }
  } catch (error) {
    console.error('AI聊天错误:', error)
    messages.value.pop() // 移除思考中消息
    messages.value.push({
      type: 'robot',
      content: '抱歉，网络连接出现问题，请检查网络后重试。',
    })
  } finally {
    isLoading.value = false
    await nextTick()
    scrollToBottom()

    if (window.MathJax?.Hub?.Queue) {
      await nextTick()
      const el = document.querySelector('.chat-dialog-box-content-qa')
      window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, el])
    }
  }
}

// 滚动到底部
const scrollToBottom = () => {
  const contentElement = document.querySelector('.chat-dialog-box-content')
  if (contentElement) {
    contentElement.scrollTop = contentElement.scrollHeight
  }
}

const getRichText = (data: any) => {
  let html = ''
  data.forEach((item: any) => {
    if (item.list && item.list.length > 0) {
      html += `<div class="question-category"><span class="icon-star"></span>${item.name}</div><div class="question-list-container">`
      item.list.forEach((node: any) => {
        const masteryPercent =
          node.mastery % 1 === 0 ? node.mastery.toFixed(0) : node.mastery.toFixed(1)
        html += `
          <div class="question-item" data-node-data='${JSON.stringify(node).replace(/'/g, '&#39;')}'>
            <span>${node.node_name}<em>${masteryPercent}%</em></span>
            <span class="arrow"></span>
          </div>
        `
      })
      html += `</div>`
    }
  })

  return html
}
const clickSummary = async () => {
  if (isLoading.value) return

  messages.value.push({
    type: 'person',
    content: '汇总报告',
  })

  await nextTick()
  scrollToBottom()

  isLoading.value = true
  const robotMessageIndex = messages.value.length
  const summaryHtml = await getRichText(summaryInfo.value)
  messages.value.push({
    type: 'robot',
    content: '',
  })
  await typewriterEffect(
    '老师您好，根据您当前的画像分析，当前的掌握情况如下：',
    robotMessageIndex,
    summaryHtml,
  )
  isLoading.value = false

  await nextTick()
  scrollToBottom()
}

const clickAreaComparison = async () => {
  if (isLoading.value) return

  messages.value.push({
    type: 'person',
    content: '区域对比',
  })

  await nextTick()
  scrollToBottom()

  isLoading.value = true
  const robotMessageIndex = messages.value.length
  const areaComparisonHtml = await getRichText(areaComparisonInfo.value)
  messages.value.push({
    type: 'robot',
    content: '',
  })
  await typewriterEffect(
    '老师您好，根据您当前的画像分析，当前的知识点对比全区情况如下：',
    robotMessageIndex,
    areaComparisonHtml,
  )
  isLoading.value = false
  await nextTick()
  scrollToBottom()
}

// 关闭聊天并清空对话
const closeChat = () => {
  expandChat.value = false
  messages.value = [
    {
      type: 'robot',
      content: `<div class="welcome">
          <div class="robot-welcome">HI，我是您的教学助手~</div>
          <div class="robot-welcome-content">关于画像和教学问题都可以问我哦，我会尽力帮您解答</div>
        </div>`,
    },
  ]
  aiHistory.value = []
  if (editorInstance) {
    editorInstance.setContent('')
  }
  isLoading.value = false
}

const initEditor = () => {
  if (!editorInstance) {
    editorInstance = new Editor({
      container: editor.value,
      theme: 'platform',
      options: [['formula-editor']],
      size: 14,
      initContent: '',
    })
  }
}
const getPortraitDetail = async () => {
  const params: any = {
    school_year: props.year,
    grade_stage_subject_id: props.grade_stage_subject_id,
    query_type: props.query_type,
    graph_book_id: props.graph_book_id,
    time_range_id: props.time_range_id,
  }
  if (props.type === 'student') {
    params.student_id = props.id
  } else if (props.type === 'teacher') {
    params.teacher_id = props.id
  } else if (props.type === 'class') {
    params.class_id = props.id
  }

  getPortraitDetailByType(props.type, params).then((res) => {
    if (res.errNo === 0 && res.data && res.data.length > 0) {
      const summary: any[] = [
        { name: '已掌握', list: [] },
        { name: '待强化', list: [] },
        { name: '未掌握', list: [] },
      ]
      const areaComparison: any[] = [
        { name: '对比区域优势', list: [] },
        { name: '对比区域劣势', list: [] },
      ]
      placeholderText.value = JSON.stringify(res?.data || [])
      res.data.forEach((item: any) => {
        if (item.mastery >= 85 && item.mastery < 100) {
          summary[0].list.push(item)
        } else if (item.mastery >= 60 && item.mastery < 85) {
          summary[1].list.push(item)
        } else if (item.mastery >= 0 && item.mastery < 60) {
          summary[2].list.push(item)
        }

        if (item.mastery > 0 && item.mastery >= item.unit_avg_mastery) {
          areaComparison[0].list.push(item)
        } else {
          areaComparison[1].list.push(item)
        }
      })
      summaryInfo.value = summary
      areaComparisonInfo.value = areaComparison
    }
  })
}

const showDetail = (node: any) => {
  emit('showDetail', node)
}

// 处理问题列表的点击事件
const handleQuestionItemClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  const questionItem = target.closest('.question-item')
  if (!questionItem) return

  const nodeDataStr = questionItem.getAttribute('data-node-data')
  if (nodeDataStr) {
    try {
      const nodeData = JSON.parse(nodeDataStr)
      showDetail(nodeData)
    } catch (error) {
      console.error('解析节点数据失败:', error)
    }
  }
}

onMounted(async () => {
  initEditor()
  getPortraitDetail()

  // 使用事件委托处理问题项的点击
  const contentElement = document.querySelector('.chat-dialog-box-content')
  if (contentElement) {
    contentElement.addEventListener('click', handleQuestionItemClick as EventListener)
  }
})

watch(
  () => [props.year, props.grade_stage_subject_id, props.time_range_id],
  () => {
    getPortraitDetail()
  },
  { deep: true },
)
</script>

<style lang="scss">
.chat-wrapper {
  position: fixed;
  bottom: 10px;
  right: 20px;
  z-index: 99;

  .chat-icon {
    background: url('@/assets/images/icon-ai-chat.png') no-repeat center center;
    background-size: 100% 100%;
    width: 48px;
    height: 70px;
    cursor: pointer;
  }

  .chat-dialog-box {
    position: absolute;
    bottom: 20px;
    left: -420px;
    width: 400px;
    height: 540px;
    background: url('@/assets/images/ai-chat-bg.png') no-repeat center center;
    background-size: 100%;
    padding: 16px;
    border-radius: 12px;

    .chat-dialog-box-header {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .header-icon {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 18px;
        color: #1f1f1f;
        font-weight: 600;
        letter-spacing: 0.5px;

        .header-icon-bg {
          display: inline-block;
          width: 32px;
          height: 32px;
          background: url('@/assets/images/header-icon-bg.png') no-repeat center center;
          background-size: 100% 100%;
          flex-shrink: 0;
        }
      }

      .header-close {
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #666;
        font-size: 18px;
        transition: color 0.2s ease;

        &:hover {
          color: #333;
        }
      }
    }

    .chat-dialog-box-content {
      height: calc(100% - 32px - 24px - 32px - 12px - 70px);
      overflow-y: auto;
      margin: 12px 0;

      &.content-expanded {
        height: calc(100% - 32px - 24px - 12px - 70px);
      }

      .chat-dialog-box-content-qa {
        display: flex;
        flex-direction: column;
        gap: 16px;

        .chat-dialog-box-content-qa-item {
          display: inline-flex;
          align-items: flex-start;
          max-width: 90%;
          padding: 12px 16px;
          border-radius: 12px;
          position: relative;
          animation: fade-in-up 0.3s ease-out;
          word-wrap: break-word;
          white-space: pre-wrap;

          &.person {
            color: #fff;
            background: linear-gradient(244deg, #c27dfe 0%, #4781ff 100%);
            box-shadow: 5px 0 7px 0 rgb(225 220 255 / 51%);
            border-radius: 12px 0 12px 12px;
            align-self: flex-end;
            margin-left: auto;
          }

          &.robot {
            background: #fff;
            color: #000;
            box-shadow: 0 2px 7px 0 rgb(225 220 255 / 34%);
            border-radius: 12px 12px 12px 0;
            align-self: flex-start;
            margin-right: auto;
          }

          .message-content {
            font-size: 14px;
            line-height: 1.5;
            word-wrap: break-word;
            white-space: pre-wrap;

            .welcome {
              white-space: normal;

              .robot-welcome {
                font-size: 16px;
                font-weight: 500;
                color: #5573f8;
              }

              .robot-welcome-content {
                font-size: 12px;
                color: #666464;
              }
            }

            .question-category {
              padding: 12px 0 8px;
              font-size: 14px;
              font-weight: 500;
              color: #1f1f1f;
              text-align: left;
              display: flex;
              align-items: center;
              gap: 8px;

              .icon-star {
                display: inline-block;
                width: 16px;
                height: 16px;
                background: url('@/assets/images/icon-star.png') no-repeat center center;
                background-size: 100% 100%;
                flex-shrink: 0;
              }
            }

            .question-list-container {
              white-space: normal;
            }

            .thinking-indicator {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              color: #4b63ff;

              .thinking-text {
                font-weight: 500;
                letter-spacing: 0.5px;
              }

              .dot {
                width: 8px;
                height: 8px;
                background: linear-gradient(230deg, #c27dfe 0%, #4781ff 100%);
                border-radius: 50%;
                animation: thinking-dot 1.4s infinite ease-in-out;

                &:nth-of-type(2) {
                  animation-delay: 0s;
                }

                &:nth-of-type(3) {
                  animation-delay: 0.2s;
                }

                &:nth-of-type(4) {
                  animation-delay: 0.4s;
                }
              }
            }

            @keyframes thinking-dot {
              0%,
              80%,
              100% {
                transform: scale(0.8);
                opacity: 0.5;
              }

              40% {
                transform: scale(1);
                opacity: 1;
              }
            }

            .question-item {
              padding: 12px;
              font-size: 14px;
              color: #1f1f1f;
              cursor: pointer;
              display: flex;
              justify-content: space-between;
              align-items: center;
              text-align: left;
              margin-bottom: 8px;
              background: #eef0ff;
              border-radius: 8px;

              span {
                display: flex;
                align-items: center;
                gap: 8px;

                em {
                  font-size: 10px;
                  color: #362aee;
                  padding: 1px 5px;
                  border-radius: 63.2px 9.5px 9.5px 63.2px;
                  background-image: linear-gradient(
                    270deg,
                    rgb(230 231 249 / 0%) 15%,
                    #e5e4f9 37%,
                    #e9e7f7 60%,
                    #ece6ff 99%
                  );
                }
              }

              &:hover {
                opacity: 0.8;
              }

              .arrow {
                display: inline-block;
                width: 20px;
                height: 20px;
                background: url('@/assets/images/icon-arrow-purple.png') no-repeat center center;
                background-size: 100% 100%;
                flex-shrink: 0;
              }
            }
          }
        }
      }
    }

    @keyframes fade-in-up {
      from {
        opacity: 0;
        transform: translateY(20px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .chat-dialog-box-footer {
      position: relative;
      display: flex;
      align-items: center;
      height: 70px;

      .footer-input {
        flex: 1;
        position: relative;
        width: 100%;
        height: 100%;

        .editor-host {
          height: 100%;
          background: #fff;
          box-shadow: 0 2px 7px 0 rgb(225 220 255 / 34%);
          border-radius: 12px;
          background-clip: padding-box, border-box;
          background-origin: padding-box, border-box;
          border: 1px solid transparent;
          background-image:
            linear-gradient(to right, #fff, #fff), linear-gradient(to right, #8279fe, #c27dfe);
        }

        .ql-toolbar {
          display: flex;
          align-items: end;
          position: absolute;
          right: 50px;
          height: 100%;
          border: none;
          background: transparent;
        }

        .ql-toolbar.ql-tiku button {
          height: 25px !important;
        }

        .ql-toolbar.ql-tiku button.ql-formula-editor .button-icon {
          background-size: 100% 100% !important;
        }

        .text-editor-wrapper p::after,
        .text-editor-wrapper li::after {
          content: '' !important;
        }
      }

      .footer-send {
        position: absolute;
        right: 0;
        bottom: 7px;
        height: 100%;
        display: flex;
        align-items: end;

        .el-button {
          width: 45px;
          padding: 8px 20px;
          font-weight: 500;
          transition: all 0.2s ease;
          height: 25px;
          margin-right: 8px;
          background: linear-gradient(230deg, #c27dfe 0%, #4781ff 100%) !important;
          box-shadow: 5px 0 7px 0 rgb(225 220 255 / 51%) !important;
          border-radius: 8px !important;
          border: none !important;
          color: #fff !important;
        }

        .el-button.el-button--primary,
        .el-button.el-button--primary.is-disabled,
        .el-button.el-button--primary.is-loading {
          background: linear-gradient(230deg, #c27dfe 0%, #4781ff 100%) !important;
          border: none !important;
          color: #fff !important;
        }
      }
    }

    .question-list {
      display: flex;
      flex-direction: row;
      gap: 8px;
      margin-bottom: 12px;

      .question-list-item {
        width: 80px;
        height: 32px;
        font-size: 12px;
        color: #1f1f1f;
        background: rgb(255 255 255 / 80%);
        border: 1px solid #fff;
        box-shadow: 0 2px 7px 0 rgb(225 220 255 / 34%);
        border-radius: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        position: relative;
        transition: all 0.3s ease;

        &:hover {
          background: rgb(255 255 255 / 95%);

          span {
            background: linear-gradient(230deg, #362aee 0%, #bf7dfe 100%);
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
        }
      }
    }
  }
}
</style>
