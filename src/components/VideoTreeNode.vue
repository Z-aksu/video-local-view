<script setup>
defineProps({
  node: { type: Object, required: true },
  selectedPath: { type: String, default: '' },
})

defineEmits(['select'])
</script>

<template>
  <details v-if="node.type === 'directory'" class="tree-folder" open>
    <summary class="folder-row">
      <svg class="folder-icon" viewBox="0 0 20 20" role="img" aria-label="Folder">
        <path d="M2.5 5.2c0-.7.6-1.2 1.3-1.2h4l1.7 1.8h6.7c.7 0 1.3.6 1.3 1.3v7.6c0 .7-.6 1.3-1.3 1.3H3.8c-.7 0-1.3-.6-1.3-1.3V5.2Z" />
        <path class="folder-line" d="M2.8 8h14.4" />
      </svg>
      <span class="tree-name">{{ node.name }}</span>
      <svg class="folder-chevron" viewBox="0 0 16 16" aria-hidden="true">
        <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
      </svg>
    </summary>
    <div class="tree-children">
      <VideoTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :selected-path="selectedPath"
        @select="$emit('select', $event)"
      />
    </div>
  </details>

  <button
    v-else
    class="video-row"
    :class="{ 'is-selected': selectedPath === node.path }"
    type="button"
    :title="node.path"
    :aria-current="selectedPath === node.path ? 'true' : undefined"
    @click="$emit('select', node)"
  >
    <svg class="video-icon" viewBox="0 0 20 20" role="img" aria-label="Video file">
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="m8 7 5 3-5 3V7Z" />
    </svg>
    <span class="tree-name">{{ node.name }}</span>
    <span class="video-extension">{{ node.name.split('.').pop().toUpperCase() }}</span>
  </button>
</template>
